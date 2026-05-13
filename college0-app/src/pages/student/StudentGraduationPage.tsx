import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import type { GradAppStatus } from '../../types/database'

type Semester = { id: string; name: string; phase: string }

type ExistingApp = {
  id: string
  status: GradAppStatus
  notes: string | null
  created_at: string
  semester: { name: string } | null
}

export function StudentGraduationPage() {
  const { user } = useAuth()
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [semesterId, setSemesterId] = useState('')
  const [passingCount, setPassingCount] = useState(0)
  const [missingRequired, setMissingRequired] = useState<string[]>([])
  const [existing, setExisting] = useState<ExistingApp[]>([])
  const [acknowledged, setAcknowledged] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    const [sems, enr, req, mine] = await Promise.all([
      supabase
        .from('semesters')
        .select('id,name,phase')
        .neq('phase', 'closed')
        .order('created_at', { ascending: false }),
      supabase
        .from('enrollments')
        .select('grade,class:classes(course_code)')
        .eq('student_id', user.id)
        .eq('status', 'enrolled')
        .not('grade', 'is', null),
      supabase.from('required_courses').select('course_code,title').order('course_code'),
      supabase
        .from('graduation_applications')
        .select('id,status,notes,created_at,semester:semesters(name)')
        .eq('student_id', user.id)
        .order('created_at', { ascending: false }),
    ])

    const semRows = (sems.data as Semester[]) ?? []
    setSemesters(semRows)
    if (!semesterId && semRows[0]) setSemesterId(semRows[0].id)

    const passingRows =
      (enr.data as unknown as { grade: string; class: { course_code: string } | null }[]) ?? []
    const passingCodes = new Set(
      passingRows
        .filter((r) => r.grade && r.grade !== 'F')
        .map((r) => r.class?.course_code)
        .filter(Boolean) as string[],
    )
    setPassingCount(passingCodes.size)

    const required = (req.data as { course_code: string; title: string }[]) ?? []
    setMissingRequired(required.filter((rc) => !passingCodes.has(rc.course_code)).map((rc) => rc.course_code))

    setExisting((mine.data as unknown as ExistingApp[]) ?? [])
    setLoading(false)
  }, [user, semesterId])

  useEffect(() => {
    void load()
  }, [load])

  const eligible = passingCount >= 8 && missingRequired.length === 0
  const hasPending = existing.some((a) => a.status === 'pending')

  async function apply(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setOk(null)
    if (!user || !semesterId) return
    if (!eligible && !acknowledged) {
      setMsg('You must acknowledge that submitting early will result in a warning.')
      return
    }

    const { error } = await supabase.from('graduation_applications').insert({
      student_id: user.id,
      semester_id: semesterId,
    })
    if (error) setMsg(error.message)
    else {
      setOk('Application submitted to the registrar.')
      setAcknowledged(false)
      await load()
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Graduation application</h1>
        <p className="text-sm text-zinc-500">
          You need 8 passing courses (including all required courses). Applying early triggers a
          warning on your record.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Courses passed</div>
          <div className="mt-1 text-lg text-white">
            {passingCount} / 8{' '}
            <span className={passingCount >= 8 ? 'text-emerald-300' : 'text-amber-300'}>
              {passingCount >= 8 ? '✓' : 'short'}
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Required courses missing</div>
          <div className="mt-1 text-white">
            {missingRequired.length === 0 ? (
              <span className="text-emerald-300">All complete</span>
            ) : (
              missingRequired.join(', ')
            )}
          </div>
        </div>
      </section>

      {hasPending ? (
        <p className="rounded border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          You already have a pending graduation application — wait for the registrar to decide.
        </p>
      ) : loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <form
          onSubmit={apply}
          className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
        >
          {msg && <p className="text-sm text-amber-300">{msg}</p>}
          {ok && <p className="text-sm text-emerald-300">{ok}</p>}

          <label className="block space-y-1">
            <span className="text-xs text-zinc-500">Apply for graduation in</span>
            <select
              value={semesterId}
              onChange={(e) => setSemesterId(e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            >
              {semesters.length === 0 ? (
                <option value="">No active semester</option>
              ) : (
                semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              )}
            </select>
          </label>

          {!eligible && (
            <div className="space-y-2 rounded border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">
              <p>
                You are <strong>not yet eligible</strong>. The registrar will reject this and you
                will receive a warning on your record.
              </p>
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5"
                />
                <span>I understand a warning will be issued if I submit this early.</span>
              </label>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!semesterId || (!eligible && !acknowledged)}
              className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {eligible ? 'Submit application' : 'Submit anyway'}
            </button>
          </div>
        </form>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">My applications</h2>
        {existing.length === 0 ? (
          <p className="text-sm text-zinc-500">No applications yet.</p>
        ) : (
          <ul className="space-y-2">
            {existing.map((a) => (
              <li
                key={a.id}
                className="rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-white">{a.semester?.name ?? '—'}</span>
                  <span
                    className={
                      a.status === 'pending'
                        ? 'text-amber-300'
                        : a.status === 'approved'
                          ? 'text-emerald-300'
                          : 'text-red-300'
                    }
                  >
                    {a.status}
                  </span>
                </div>
                <div className="text-xs text-zinc-500">
                  Submitted {new Date(a.created_at).toLocaleString()}
                </div>
                {a.notes && (
                  <div className="mt-1 text-xs text-zinc-400">Registrar notes: {a.notes}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
