import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import type { EnrollmentStatus, GradeLetter, SemesterPhase } from '../../types/database'

type EnrollmentHistory = {
  id: string
  status: EnrollmentStatus
  grade: GradeLetter | null
  semester_id: string
  class: { course_code: string; title: string } | null
  semester: { name: string; phase: SemesterPhase; created_at: string } | null
}

const gradePoints: Record<GradeLetter, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 }

export function StudentProfilePage() {
  const { user, profile } = useAuth()
  const [enrollments, setEnrollments] = useState<EnrollmentHistory[]>([])
  const [warnings, setWarnings] = useState<{ id: string; reason: string; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user) return
      const [enr, warn] = await Promise.all([
        supabase
          .from('enrollments')
          .select(
            'id,status,grade,semester_id,class:classes(course_code,title),semester:semesters(name,phase,created_at)',
          )
          .eq('student_id', user.id)
          .order('enrolled_at', { ascending: false }),
        supabase
          .from('warnings')
          .select('id,reason,created_at')
          .eq('target_id', user.id)
          .eq('is_removed', false)
          .order('created_at', { ascending: false }),
      ])
      if (!cancelled) {
        setEnrollments((enr.data as unknown as EnrollmentHistory[]) ?? [])
        setWarnings((warn.data as { id: string; reason: string; created_at: string }[]) ?? [])
        setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; phase: SemesterPhase; created_at: string; rows: EnrollmentHistory[] }>()
    for (const e of enrollments) {
      const key = e.semester_id
      if (!map.has(key)) {
        map.set(key, {
          name: e.semester?.name ?? 'Unknown',
          phase: e.semester?.phase ?? 'closed',
          created_at: e.semester?.created_at ?? '',
          rows: [],
        })
      }
      map.get(key)!.rows.push(e)
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].created_at.localeCompare(a[1].created_at))
      .map(([id, sem]) => ({ id, ...sem }))
  }, [enrollments])

  const isHonorRoll =
    profile?.cumulative_gpa !== null &&
    profile?.cumulative_gpa !== undefined &&
    profile.cumulative_gpa >= 3.5 &&
    (profile.honor_roll_count ?? 0) > 1

  function semesterGpa(rows: EnrollmentHistory[]) {
    const graded = rows.filter((r) => r.grade !== null && r.status === 'enrolled')
    if (graded.length === 0) return null
    const sum = graded.reduce((a, r) => a + gradePoints[r.grade as GradeLetter], 0)
    return (sum / graded.length).toFixed(2)
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-white">My profile & records</h1>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Field label="Full name" value={profile?.full_name ?? '—'} />
          <Field label="Student ID" value={profile?.student_id ?? '—'} />
          <Field label="Email" value={user?.email ?? '—'} />
          <Field label="Status" value={profile?.status ?? '—'} />
          <Field label="Cumulative GPA" value={profile?.cumulative_gpa ?? '—'} />
          <Field label="Warnings on record" value={warnings.length} />
          <Field
            label="Honor roll"
            value={isHonorRoll ? 'Yes ⭐' : 'No'}
          />
          <Field
            label="Special registration"
            value={profile?.special_registration_eligible ? 'Eligible' : '—'}
          />
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          Update your name or password in{' '}
          <Link to="/account" className="text-indigo-300 hover:underline">
            Account settings
          </Link>
          .
        </p>
      </section>

      {warnings.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-white">Warnings</h2>
          <ul className="space-y-2">
            {warnings.map((w) => (
              <li
                key={w.id}
                className="rounded border border-amber-800/60 bg-amber-950/20 p-3 text-sm text-amber-100"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>{w.reason}</span>
                  <span className="text-xs text-amber-300/70">
                    {new Date(w.created_at).toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Academic history</h2>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-zinc-500">No coursework yet.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map((sem) => {
              const gpa = semesterGpa(sem.rows)
              return (
                <div key={sem.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-sm">
                      <span className="text-white">{sem.name}</span>{' '}
                      <span className="text-xs text-zinc-500">({sem.phase})</span>
                    </div>
                    <div className="text-xs text-zinc-500">
                      Semester GPA: <span className="text-zinc-200">{gpa ?? '—'}</span>
                    </div>
                  </div>
                  <table className="mt-3 w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="py-1">Course</th>
                        <th className="py-1">Status</th>
                        <th className="py-1 text-right">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sem.rows.map((r) => (
                        <tr key={r.id} className="border-t border-zinc-800/70">
                          <td className="py-1.5 text-zinc-200">
                            {r.class?.course_code} · {r.class?.title}
                          </td>
                          <td className="py-1.5 text-zinc-400">{r.status}</td>
                          <td className="py-1.5 text-right text-zinc-200">{r.grade ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="text-white">{value}</dd>
    </div>
  )
}
