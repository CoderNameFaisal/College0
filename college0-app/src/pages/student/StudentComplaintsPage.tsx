import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import type { ComplaintStatus, UserRole } from '../../types/database'

type TargetOption = {
  id: string
  full_name: string
  role: UserRole
  hint?: string
}

type FiledComplaint = {
  id: string
  description: string
  resolution: string | null
  status: ComplaintStatus
  created_at: string
  target: { id: string; full_name: string; role: UserRole } | null
}

export function StudentComplaintsPage() {
  const { user } = useAuth()
  const [targets, setTargets] = useState<TargetOption[]>([])
  const [filed, setFiled] = useState<FiledComplaint[]>([])
  const [targetId, setTargetId] = useState('')
  const [description, setDescription] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return

    // Build picker: instructors of my classes + classmates from my classes
    const { data: myClassIds } = await supabase
      .from('enrollments')
      .select('class_id')
      .eq('student_id', user.id)
      .in('status', ['enrolled', 'waitlisted'])
    const classIds = ((myClassIds as { class_id: string }[]) ?? []).map((r) => r.class_id)

    const opts: TargetOption[] = []
    const seen = new Set<string>([user.id])

    if (classIds.length > 0) {
      const [instr, classmates] = await Promise.all([
        supabase
          .from('classes')
          .select(
            'course_code,instructor:profiles!classes_instructor_id_fkey(id,full_name,role)',
          )
          .in('id', classIds),
        supabase
          .from('enrollments')
          .select('class_id,student:profiles(id,full_name,role)')
          .in('class_id', classIds)
          .in('status', ['enrolled', 'waitlisted']),
      ])
      for (const r of (instr.data as unknown as {
        course_code: string
        instructor: { id: string; full_name: string; role: UserRole } | null
      }[]) ?? []) {
        if (r.instructor && !seen.has(r.instructor.id)) {
          seen.add(r.instructor.id)
          opts.push({ ...r.instructor, hint: `Instructor — ${r.course_code}` })
        }
      }
      for (const r of (classmates.data as unknown as {
        student: { id: string; full_name: string; role: UserRole } | null
      }[]) ?? []) {
        if (r.student && !seen.has(r.student.id)) {
          seen.add(r.student.id)
          opts.push({ ...r.student, hint: 'Classmate' })
        }
      }
    }
    opts.sort((a, b) => a.full_name.localeCompare(b.full_name))
    setTargets(opts)

    const { data: mine } = await supabase
      .from('complaints')
      .select(
        'id,description,resolution,status,created_at,target:profiles!complaints_against_fkey(id,full_name,role)',
      )
      .eq('filed_by', user.id)
      .order('created_at', { ascending: false })
    setFiled((mine as unknown as FiledComplaint[]) ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setOk(null)
    if (!user || !targetId || !description.trim()) {
      setMsg('Pick a target and write a description.')
      return
    }
    const { error } = await supabase.from('complaints').insert({
      filed_by: user.id,
      against: targetId,
      description: description.trim(),
    })
    if (error) setMsg(error.message)
    else {
      setTargetId('')
      setDescription('')
      setOk('Complaint filed. The registrar will investigate.')
      await load()
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Complaints</h1>
        <p className="text-sm text-zinc-500">
          File a complaint against a student or an instructor from your classes. The registrar will
          investigate and respond.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
      >
        <h2 className="text-sm font-semibold text-white">File a new complaint</h2>
        {msg && <p className="text-sm text-amber-300">{msg}</p>}
        {ok && <p className="text-sm text-emerald-300">{ok}</p>}

        <label className="block space-y-1">
          <span className="text-xs text-zinc-500">Target</span>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
          >
            <option value="">— select an instructor or classmate —</option>
            {targets.length === 0 ? (
              <option value="" disabled>
                You aren't currently enrolled in any classes
              </option>
            ) : (
              targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name} ({t.hint ?? t.role})
                </option>
              ))
            )}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-zinc-500">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            placeholder="What happened? Provide enough detail for the registrar to investigate."
          />
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-40"
            disabled={!targetId || !description.trim()}
          >
            File complaint
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Complaints I've filed</h2>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : filed.length === 0 ? (
          <p className="text-sm text-zinc-500">You haven't filed any complaints yet.</p>
        ) : (
          <ul className="space-y-2">
            {filed.map((c) => (
              <li
                key={c.id}
                className="rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-white">
                    vs {c.target?.full_name ?? '—'}{' '}
                    <span className="text-xs text-zinc-500">({c.target?.role ?? '?'})</span>
                  </div>
                  <span
                    className={
                      c.status === 'open' ? 'text-xs text-amber-300' : 'text-xs text-emerald-300'
                    }
                  >
                    {c.status}
                  </span>
                </div>
                <p className="mt-1 text-zinc-300">{c.description}</p>
                <div className="mt-1 text-xs text-zinc-500">
                  Filed {new Date(c.created_at).toLocaleString()}
                </div>
                {c.resolution && (
                  <p className="mt-1 text-xs text-zinc-400">Registrar resolution: {c.resolution}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
