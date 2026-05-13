import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

type Row = {
  id: string
  class_id: string
  enrolled_at: string
  student: {
    id: string
    full_name: string
    student_id: string | null
    cumulative_gpa: number | null
    warning_count: number
  } | null
}

type ClassInfo = {
  id: string
  course_code: string
  title: string
  max_students: number
  enrolled_count: number
}

export function InstructorWaitlistPage() {
  const { user } = useAuth()
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [waitlists, setWaitlists] = useState<Record<string, Row[]>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    const { data: cs } = await supabase
      .from('classes')
      .select('id,course_code,title,max_students')
      .eq('instructor_id', user.id)
      .order('course_code')
    const classRows = (cs as Omit<ClassInfo, 'enrolled_count'>[]) ?? []
    if (classRows.length === 0) {
      setClasses([])
      setWaitlists({})
      setLoading(false)
      return
    }

    const classIds = classRows.map((c) => c.id)
    const [{ data: enrs }, { data: wls }] = await Promise.all([
      supabase
        .from('enrollments')
        .select('class_id')
        .in('class_id', classIds)
        .eq('status', 'enrolled'),
      supabase
        .from('enrollments')
        .select(
          'id,class_id,enrolled_at,student:profiles(id,full_name,student_id,cumulative_gpa,warning_count)',
        )
        .in('class_id', classIds)
        .eq('status', 'waitlisted')
        .order('enrolled_at'),
    ])

    const counts: Record<string, number> = {}
    for (const e of (enrs as { class_id: string }[]) ?? []) {
      counts[e.class_id] = (counts[e.class_id] ?? 0) + 1
    }
    setClasses(classRows.map((c) => ({ ...c, enrolled_count: counts[c.id] ?? 0 })))

    const grouped: Record<string, Row[]> = {}
    for (const w of (wls as unknown as Row[]) ?? []) {
      if (!grouped[w.class_id]) grouped[w.class_id] = []
      grouped[w.class_id].push(w)
    }
    setWaitlists(grouped)
    setLoading(false)
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  async function accept(enrollmentId: string) {
    setMsg(null)
    const { error } = await supabase.rpc('rpc_promote_waitlist', { p_enrollment_id: enrollmentId })
    if (error) setMsg(error.message)
    else await load()
  }

  async function reject(enrollmentId: string) {
    setMsg(null)
    const { error } = await supabase.rpc('rpc_reject_waitlist', { p_enrollment_id: enrollmentId })
    if (error) setMsg(error.message)
    else await load()
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Waitlist management</h1>
      {msg && <p className="text-sm text-amber-300">{msg}</p>}

      {classes.length === 0 ? (
        <p className="text-sm text-zinc-500">No classes assigned.</p>
      ) : (
        <ul className="space-y-4">
          {classes.map((c) => {
            const rows = waitlists[c.id] ?? []
            const seatsLeft = c.max_students - c.enrolled_count
            return (
              <li key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm text-white">
                    {c.course_code} · {c.title}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {c.enrolled_count}/{c.max_students} enrolled ·{' '}
                    <span className={seatsLeft > 0 ? 'text-emerald-300' : 'text-amber-300'}>
                      {seatsLeft} seat{seatsLeft === 1 ? '' : 's'} left
                    </span>{' '}
                    · {rows.length} waitlisted
                  </div>
                </div>
                {rows.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-500">Waitlist is empty.</p>
                ) : (
                  <table className="mt-3 w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="py-2">Student</th>
                        <th className="py-2">Student ID</th>
                        <th className="py-2">GPA</th>
                        <th className="py-2">Warnings</th>
                        <th className="py-2">Waitlisted</th>
                        <th className="py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-t border-zinc-800/70">
                          <td className="py-1.5 text-zinc-200">{r.student?.full_name ?? '—'}</td>
                          <td className="py-1.5 text-zinc-400">{r.student?.student_id ?? '—'}</td>
                          <td className="py-1.5 text-zinc-400">{r.student?.cumulative_gpa ?? '—'}</td>
                          <td className="py-1.5 text-zinc-400">{r.student?.warning_count ?? 0}</td>
                          <td className="py-1.5 text-zinc-500">
                            {new Date(r.enrolled_at).toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                disabled={seatsLeft <= 0}
                                title={seatsLeft <= 0 ? 'Class is full' : undefined}
                                onClick={() => void accept(r.id)}
                                className="rounded bg-emerald-700 px-2 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-40"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={() => void reject(r.id)}
                                className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
