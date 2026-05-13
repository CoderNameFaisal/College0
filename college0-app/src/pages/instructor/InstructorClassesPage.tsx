import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import type { EnrollmentStatus, GradeLetter, SemesterPhase } from '../../types/database'

type ClassRow = {
  id: string
  course_code: string
  title: string
  schedule_time: string
  max_students: number
  avg_rating: number | null
  is_cancelled: boolean
  semester: { id: string; name: string; phase: SemesterPhase } | null
}

type EnrollmentRow = {
  id: string
  status: EnrollmentStatus
  grade: GradeLetter | null
  student: {
    id: string
    full_name: string
    student_id: string | null
    cumulative_gpa: number | null
    warning_count: number
  } | null
}

export function InstructorClassesPage() {
  const { user } = useAuth()
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [enrollments, setEnrollments] = useState<Record<string, EnrollmentRow[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user) return
      const { data: cs } = await supabase
        .from('classes')
        .select(
          'id,course_code,title,schedule_time,max_students,avg_rating,is_cancelled,semester:semesters(id,name,phase)',
        )
        .eq('instructor_id', user.id)
        .order('course_code')
      const list = (cs as unknown as ClassRow[]) ?? []
      if (cancelled) return
      setClasses(list)

      if (list.length > 0) {
        const { data: es } = await supabase
          .from('enrollments')
          .select(
            'id,class_id,status,grade,student:profiles(id,full_name,student_id,cumulative_gpa,warning_count)',
          )
          .in(
            'class_id',
            list.map((c) => c.id),
          )
        if (cancelled) return
        const grouped: Record<string, EnrollmentRow[]> = {}
        for (const e of ((es ?? []) as unknown as Array<EnrollmentRow & { class_id: string }>)) {
          if (!grouped[e.class_id]) grouped[e.class_id] = []
          grouped[e.class_id].push(e)
        }
        setEnrollments(grouped)
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>
  if (classes.length === 0)
    return (
      <p className="text-sm text-zinc-500">
        No classes assigned yet. The registrar must assign classes to you.
      </p>
    )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">My classes</h1>

      <ul className="space-y-3">
        {classes.map((c) => {
          const rows = enrollments[c.id] ?? []
          const enrolled = rows.filter((r) => r.status === 'enrolled')
          const waitlisted = rows.filter((r) => r.status === 'waitlisted')
          const isOpen = expanded === c.id
          return (
            <li
              key={c.id}
              className={`rounded-lg border bg-zinc-900/40 transition-colors ${
                c.is_cancelled ? 'border-red-900/60' : 'border-zinc-800'
              }`}
            >
              <button
                type="button"
                className="flex w-full flex-wrap items-baseline justify-between gap-3 p-4 text-left"
                onClick={() => setExpanded(isOpen ? null : c.id)}
              >
                <div>
                  <div className="text-sm font-semibold text-white">
                    {c.course_code} · {c.title}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {c.semester?.name} ({c.semester?.phase}) ·{' '}
                    {formatTsRange(c.schedule_time)} · {enrolled.length}/{c.max_students} enrolled ·{' '}
                    {waitlisted.length} waitlisted · rating {c.avg_rating ?? '—'}
                    {c.is_cancelled && <span className="ml-2 text-red-300">cancelled</span>}
                  </div>
                </div>
                <span className="text-xs text-zinc-400">{isOpen ? 'Hide roster' : 'Show roster'}</span>
              </button>

              {isOpen && (
                <div className="border-t border-zinc-800 p-4">
                  {rows.length === 0 ? (
                    <p className="text-sm text-zinc-500">No enrollments yet.</p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wider text-zinc-500">
                        <tr>
                          <th className="py-2">Student</th>
                          <th className="py-2">Student ID</th>
                          <th className="py-2">Status</th>
                          <th className="py-2">Grade</th>
                          <th className="py-2">GPA</th>
                          <th className="py-2">Warnings</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((e) => (
                          <tr key={e.id} className="border-t border-zinc-800/70">
                            <td className="py-1.5 text-zinc-200">{e.student?.full_name ?? '—'}</td>
                            <td className="py-1.5 text-zinc-400">{e.student?.student_id ?? '—'}</td>
                            <td className="py-1.5 text-zinc-400">{e.status}</td>
                            <td className="py-1.5 text-zinc-200">{e.grade ?? '—'}</td>
                            <td className="py-1.5 text-zinc-400">{e.student?.cumulative_gpa ?? '—'}</td>
                            <td className="py-1.5 text-zinc-400">{e.student?.warning_count ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function formatTsRange(raw: string): string {
  // Postgres tsrange comes back like `["2026-02-01 09:00:00","2026-02-01 10:30:00")`
  // Best-effort short format; if parsing fails, just show raw.
  const m = raw.match(/[[(]\s*"?([^,"]+)"?\s*,\s*"?([^,"]+)"?\s*[\])]/)
  if (!m) return raw
  try {
    const a = new Date(m[1])
    const b = new Date(m[2])
    const date = a.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    return `${date} ${t(a)}–${t(b)}`
  } catch {
    return raw
  }
}
