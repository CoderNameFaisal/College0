import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { EnrollmentStatus, GradeLetter, SemesterPhase } from '../../types/database'

type ClassRow = {
  id: string
  course_code: string
  title: string
  avg_rating: number | null
  is_cancelled: boolean
  max_students: number
  instructor: { id: string; full_name: string } | null
  semester: { id: string; name: string; phase: SemesterPhase } | null
}

type EnrollmentRow = {
  id: string
  class_id: string
  status: EnrollmentStatus
  grade: GradeLetter | null
  student: { id: string; full_name: string; student_id: string | null } | null
}

type ReviewRow = {
  id: string
  class_id: string
  stars: number
  body: string
  filtered_body: string | null
  is_hidden: boolean
  created_at: string
  author: { id: string; full_name: string } | null
}

export function RegistrarOverviewPage() {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([])
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [semesterFilter, setSemesterFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [c, e, r] = await Promise.all([
        supabase
          .from('classes')
          .select(
            'id,course_code,title,avg_rating,is_cancelled,max_students,instructor:profiles!classes_instructor_id_fkey(id,full_name),semester:semesters(id,name,phase)',
          )
          .order('course_code'),
        supabase
          .from('enrollments')
          .select(
            'id,class_id,status,grade,student:profiles!enrollments_student_id_fkey(id,full_name,student_id)',
          ),
        supabase
          .from('reviews')
          .select(
            'id,class_id,stars,body,filtered_body,is_hidden,created_at,author:profiles!reviews_author_id_fkey(id,full_name)',
          )
          .order('created_at', { ascending: false }),
      ])
      if (!cancelled) {
        setClasses((c.data as unknown as ClassRow[]) ?? [])
        setEnrollments((e.data as unknown as EnrollmentRow[]) ?? [])
        setReviews((r.data as unknown as ReviewRow[]) ?? [])
        setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const semesters = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of classes) {
      if (c.semester) map.set(c.semester.id, c.semester.name)
    }
    return Array.from(map, ([id, name]) => ({ id, name }))
  }, [classes])

  const filteredClasses = useMemo(() => {
    if (semesterFilter === 'all') return classes
    return classes.filter((c) => c.semester?.id === semesterFilter)
  }, [classes, semesterFilter])

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Course & grade overview</h1>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">Semester:</span>
        <button
          type="button"
          onClick={() => setSemesterFilter('all')}
          className={`rounded-full border px-3 py-1 ${
            semesterFilter === 'all'
              ? 'border-indigo-500 bg-indigo-600 text-white'
              : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
          }`}
        >
          All
        </button>
        {semesters.map((s) => (
          <button
            type="button"
            key={s.id}
            onClick={() => setSemesterFilter(s.id)}
            className={`rounded-full border px-3 py-1 ${
              semesterFilter === s.id
                ? 'border-indigo-500 bg-indigo-600 text-white'
                : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <ul className="space-y-3">
        {filteredClasses.map((c) => {
          const cEnrollments = enrollments.filter((e) => e.class_id === c.id)
          const enrolled = cEnrollments.filter((e) => e.status === 'enrolled')
          const waitlisted = cEnrollments.filter((e) => e.status === 'waitlisted')
          const cReviews = reviews.filter((r) => r.class_id === c.id)
          const isOpen = expanded === c.id
          return (
            <li
              key={c.id}
              className={`rounded-lg border bg-zinc-900/40 p-4 transition-colors ${
                c.is_cancelled ? 'border-red-900/60' : 'border-zinc-800'
              }`}
            >
              <button
                type="button"
                className="flex w-full flex-wrap items-baseline justify-between gap-3 text-left"
                onClick={() => setExpanded(isOpen ? null : c.id)}
              >
                <div>
                  <div className="text-sm font-semibold text-white">
                    {c.course_code} · {c.title}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {c.semester?.name ?? '—'} · {c.instructor?.full_name ?? 'no instructor'} ·{' '}
                    {enrolled.length}/{c.max_students} enrolled · {waitlisted.length} waitlisted ·{' '}
                    {cReviews.length} reviews · rating {c.avg_rating ?? '—'}
                    {c.is_cancelled && <span className="ml-2 text-red-300">cancelled</span>}
                  </div>
                </div>
                <span className="text-xs text-zinc-400">{isOpen ? 'Hide' : 'Show details'}</span>
              </button>

              {isOpen && (
                <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Enrollments
                    </h3>
                    {cEnrollments.length === 0 ? (
                      <p className="mt-1 text-sm text-zinc-500">None.</p>
                    ) : (
                      <table className="mt-2 w-full text-left text-xs">
                        <thead className="text-zinc-500">
                          <tr>
                            <th className="py-1">Student</th>
                            <th className="py-1">Student ID</th>
                            <th className="py-1">Status</th>
                            <th className="py-1">Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cEnrollments.map((e) => (
                            <tr key={e.id} className="border-t border-zinc-800/70">
                              <td className="py-1 text-zinc-200">
                                {e.student?.full_name ?? '—'}
                              </td>
                              <td className="py-1 text-zinc-400">
                                {e.student?.student_id ?? '—'}
                              </td>
                              <td className="py-1 text-zinc-400">{e.status}</td>
                              <td className="py-1 text-zinc-200">{e.grade ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Reviews (author visible)
                    </h3>
                    {cReviews.length === 0 ? (
                      <p className="mt-1 text-sm text-zinc-500">None.</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {cReviews.map((r) => (
                          <li
                            key={r.id}
                            className="rounded border border-zinc-800 bg-zinc-950/40 p-3 text-xs"
                          >
                            <div className="flex items-center justify-between text-zinc-500">
                              <span>
                                {'★'.repeat(r.stars)}
                                {'☆'.repeat(5 - r.stars)} · {r.author?.full_name ?? 'anonymous'}
                              </span>
                              <span>
                                {new Date(r.created_at).toLocaleString()}
                                {r.is_hidden && <span className="ml-2 text-amber-300">hidden</span>}
                              </span>
                            </div>
                            <p className="mt-1 text-zinc-200">
                              {r.filtered_body ?? r.body}
                            </p>
                            {r.filtered_body && r.filtered_body !== r.body && (
                              <p className="mt-1 text-zinc-500">
                                Original: <span className="text-zinc-400">{r.body}</span>
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
