import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import type { ComplaintStatus } from '../../types/database'

type StudentOption = {
  id: string
  full_name: string
  student_id: string | null
}

type FiledComplaint = {
  id: string
  description: string
  resolution: string | null
  status: ComplaintStatus
  created_at: string
  target: { id: string; full_name: string } | null
}

export function InstructorComplaintsPage() {
  const { user } = useAuth()
  const [students, setStudents] = useState<StudentOption[]>([])
  const [filed, setFiled] = useState<FiledComplaint[]>([])
  const [targetId, setTargetId] = useState('')
  const [description, setDescription] = useState('')
  const [requestType, setRequestType] = useState<'warning' | 'deregistration'>('warning')
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return

    // Pull students enrolled (or waitlisted) in any of my classes for the picker.
    const { data: cs } = await supabase.from('classes').select('id').eq('instructor_id', user.id)
    const classIds = ((cs as { id: string }[]) ?? []).map((c) => c.id)
    if (classIds.length > 0) {
      const { data: enr } = await supabase
        .from('enrollments')
        .select('student:profiles(id,full_name,student_id)')
        .in('class_id', classIds)
        .in('status', ['enrolled', 'waitlisted'])
      const seen = new Set<string>()
      const opts: StudentOption[] = []
      for (const e of ((enr ?? []) as unknown as { student: StudentOption | null }[])) {
        if (e.student && !seen.has(e.student.id)) {
          seen.add(e.student.id)
          opts.push(e.student)
        }
      }
      opts.sort((a, b) => a.full_name.localeCompare(b.full_name))
      setStudents(opts)
    }

    const { data: filedRows } = await supabase
      .from('complaints')
      .select(
        'id,description,resolution,status,created_at,target:profiles!complaints_against_fkey(id,full_name)',
      )
      .eq('filed_by', user.id)
      .order('created_at', { ascending: false })
    setFiled((filedRows as unknown as FiledComplaint[]) ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  async function fileComplaint(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setOk(null)
    if (!user || !targetId || !description.trim()) {
      setMsg('Pick a student and write a description.')
      return
    }
    const fullDescription = `[Request: ${requestType === 'warning' ? 'warning' : 'de-registration'}] ${description.trim()}`
    const { error } = await supabase.from('complaints').insert({
      filed_by: user.id,
      against: targetId,
      description: fullDescription,
    })
    if (error) setMsg(error.message)
    else {
      setTargetId('')
      setDescription('')
      setRequestType('warning')
      setOk('Complaint filed. The registrar will review it.')
      await load()
    }
  }

  const studentName = useMemo(() => {
    return (id: string | null) => students.find((s) => s.id === id)?.full_name ?? null
  }, [students])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Complaints</h1>
        <p className="text-sm text-zinc-500">
          File a complaint against a student to the registrar. Every instructor complaint must be
          acted on by the registrar.
        </p>
      </div>

      <form
        onSubmit={fileComplaint}
        className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
      >
        <h2 className="text-sm font-semibold text-white">File a new complaint</h2>
        {msg && <p className="text-sm text-amber-300">{msg}</p>}
        {ok && <p className="text-sm text-emerald-300">{ok}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-zinc-500">Student (from your classes)</span>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            >
              <option value="">— select —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} {s.student_id ? `(${s.student_id})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-zinc-500">Requested action</span>
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as 'warning' | 'deregistration')}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            >
              <option value="warning">Issue a warning</option>
              <option value="deregistration">De-register from class</option>
            </select>
          </label>
        </div>

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
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
          >
            File complaint
          </button>
        </div>
      </form>

      <section className="space-y-2">
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
                    vs {c.target?.full_name ?? studentName(c.target?.id ?? null) ?? '—'}
                  </div>
                  <div className="text-xs">
                    {new Date(c.created_at).toLocaleString()} ·{' '}
                    <span className={c.status === 'open' ? 'text-amber-300' : 'text-emerald-300'}>
                      {c.status}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-zinc-300">{c.description}</p>
                {c.resolution && (
                  <p className="mt-1 text-xs text-zinc-500">Registrar resolution: {c.resolution}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
