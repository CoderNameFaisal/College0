import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import type { GradeLetter, SemesterPhase } from '../../types/database'

type ClassRow = {
  id: string
  course_code: string
  title: string
  semester: { id: string; name: string; phase: SemesterPhase } | null
}

type EnrollmentRow = {
  id: string
  class_id: string
  grade: GradeLetter | null
  student: { id: string; full_name: string; student_id: string | null } | null
}

const grades: GradeLetter[] = ['A', 'B', 'C', 'D', 'F']

export function InstructorGradingPage() {
  const { user } = useAuth()
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [enrollments, setEnrollments] = useState<Record<string, EnrollmentRow[]>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    const { data: cs } = await supabase
      .from('classes')
      .select('id,course_code,title,semester:semesters(id,name,phase)')
      .eq('instructor_id', user.id)
      .order('course_code')
    const list = (cs as unknown as ClassRow[]) ?? []
    setClasses(list)

    if (list.length > 0) {
      const { data: es } = await supabase
        .from('enrollments')
        .select('id,class_id,grade,student:profiles(id,full_name,student_id)')
        .in(
          'class_id',
          list.map((c) => c.id),
        )
        .eq('status', 'enrolled')
        .order('class_id')
      const grouped: Record<string, EnrollmentRow[]> = {}
      for (const e of ((es ?? []) as unknown as EnrollmentRow[])) {
        if (!grouped[e.class_id]) grouped[e.class_id] = []
        grouped[e.class_id].push(e)
      }
      setEnrollments(grouped)
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  async function setGrade(enrollmentId: string, grade: GradeLetter) {
    setSavingId(enrollmentId)
    setMsg(null)
    const { error } = await supabase.rpc('rpc_post_grade', {
      p_enrollment_id: enrollmentId,
      p_grade: grade,
    })
    setSavingId(null)
    if (error) setMsg(error.message)
    else await load()
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Grading</h1>
      {msg && <p className="text-sm text-amber-300">{msg}</p>}

      {classes.length === 0 ? (
        <p className="text-sm text-zinc-500">No classes assigned.</p>
      ) : (
        <ul className="space-y-4">
          {classes.map((c) => {
            const inGrading = c.semester?.phase === 'grading'
            const rows = enrollments[c.id] ?? []
            const ungraded = rows.filter((r) => r.grade === null).length
            return (
              <li key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm text-white">
                    {c.course_code} · {c.title}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {c.semester?.name} ·{' '}
                    <span className={inGrading ? 'text-emerald-300' : 'text-amber-300'}>
                      {c.semester?.phase}
                    </span>{' '}
                    · {rows.length} enrolled
                    {ungraded > 0 && (
                      <span className="ml-2 text-amber-300">{ungraded} ungraded</span>
                    )}
                  </div>
                </div>

                {!inGrading && (
                  <p className="mt-3 rounded border border-amber-700/60 bg-amber-950/30 p-2 text-xs text-amber-200">
                    Grading is disabled — semester is in <code>{c.semester?.phase}</code> phase, not
                    grading.
                  </p>
                )}

                {rows.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-500">No enrolled students.</p>
                ) : (
                  <table className="mt-3 w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="py-2">Student</th>
                        <th className="py-2">Student ID</th>
                        <th className="py-2 text-right">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-t border-zinc-800/70">
                          <td className="py-1.5 text-zinc-200">{r.student?.full_name ?? '—'}</td>
                          <td className="py-1.5 text-zinc-400">{r.student?.student_id ?? '—'}</td>
                          <td className="py-1.5 text-right">
                            <div className="flex justify-end gap-1">
                              {grades.map((g) => (
                                <button
                                  type="button"
                                  key={g}
                                  disabled={!inGrading || savingId === r.id}
                                  onClick={() => void setGrade(r.id, g)}
                                  className={`rounded border px-2 py-0.5 text-xs disabled:opacity-40 ${
                                    r.grade === g
                                      ? 'border-indigo-500 bg-indigo-600 text-white'
                                      : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                  }`}
                                >
                                  {g}
                                </button>
                              ))}
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

      <p className="text-xs text-zinc-500">
        Note: once a grade is posted, the student can no longer submit a review for that class.
      </p>
    </div>
  )
}
