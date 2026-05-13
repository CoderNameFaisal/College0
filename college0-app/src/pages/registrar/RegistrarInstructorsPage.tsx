import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { ProfileStatus, SemesterPhase } from '../../types/database'

type Instructor = {
  id: string
  full_name: string
  status: ProfileStatus
  warning_count: number
}

type ClassInfo = {
  id: string
  instructor_id: string | null
  avg_rating: number | null
  is_cancelled: boolean
  semester: { id: string; phase: SemesterPhase } | null
}

type EnrollmentInfo = {
  class_id: string
  grade: string | null
}

export function RegistrarInstructorsPage() {
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [enrollments, setEnrollments] = useState<EnrollmentInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [p, c, e] = await Promise.all([
        supabase
          .from('profiles')
          .select('id,full_name,status,warning_count')
          .eq('role', 'instructor')
          .order('full_name'),
        supabase
          .from('classes')
          .select('id,instructor_id,avg_rating,is_cancelled,semester:semesters(id,phase)')
          .not('instructor_id', 'is', null),
        supabase
          .from('enrollments')
          .select('class_id,grade')
          .eq('status', 'enrolled'),
      ])
      if (!cancelled) {
        setInstructors((p.data as Instructor[]) ?? [])
        setClasses((c.data as unknown as ClassInfo[]) ?? [])
        setEnrollments((e.data as EnrollmentInfo[]) ?? [])
        setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const rows = useMemo(() => {
    return instructors.map((i) => {
      const myClasses = classes.filter((c) => c.instructor_id === i.id)
      const activeClasses = myClasses.filter((c) => !c.is_cancelled)
      const ratings = activeClasses.map((c) => c.avg_rating).filter((r): r is number => r !== null)
      const avgRating =
        ratings.length === 0 ? null : ratings.reduce((a, b) => a + b, 0) / ratings.length

      // Missing-grades flag: any of their classes is in grading or closed phase
      // and has an enrollment without a grade.
      const gradingOrClosed = myClasses.filter(
        (c) => c.semester && (c.semester.phase === 'grading' || c.semester.phase === 'closed'),
      )
      const missingGrades = gradingOrClosed.some((c) =>
        enrollments.some((e) => e.class_id === c.id && e.grade === null),
      )

      const allCancelled = myClasses.length > 0 && myClasses.every((c) => c.is_cancelled)

      return {
        ...i,
        classCount: myClasses.length,
        activeCount: activeClasses.length,
        avgRating,
        missingGrades,
        allCancelled,
      }
    })
  }, [instructors, classes, enrollments])

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Instructors</h1>

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Classes</th>
              <th className="px-4 py-2">Avg rating</th>
              <th className="px-4 py-2">Warnings</th>
              <th className="px-4 py-2">Flags</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-zinc-500">
                  No instructors on record.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const flags: string[] = []
                if (r.avgRating !== null && r.avgRating < 2.0) flags.push('low rating')
                if (r.missingGrades) flags.push('missing grades')
                if (r.allCancelled) flags.push('all classes cancelled')
                if (r.warning_count >= 3) flags.push('≥3 warnings')
                return (
                  <tr key={r.id} className="border-t border-zinc-800 hover:bg-zinc-900/40">
                    <td className="px-4 py-2 text-white">{r.full_name}</td>
                    <td className="px-4 py-2 text-zinc-300">{r.status}</td>
                    <td className="px-4 py-2 text-zinc-300">
                      {r.activeCount} active / {r.classCount} total
                    </td>
                    <td className="px-4 py-2 text-zinc-300">
                      {r.avgRating === null ? '—' : r.avgRating.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-zinc-300">{r.warning_count}</td>
                    <td className="px-4 py-2 text-xs text-amber-300">
                      {flags.length === 0 ? '—' : flags.join(', ')}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        to={`/registrar/instructors/${r.id}`}
                        className="text-xs text-indigo-300 hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
