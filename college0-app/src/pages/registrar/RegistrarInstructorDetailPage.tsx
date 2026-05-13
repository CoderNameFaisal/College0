import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { GradeLetter, ProfileStatus, SemesterPhase } from '../../types/database'

type Instructor = {
  id: string
  full_name: string
  status: ProfileStatus
  warning_count: number
}

type ClassRow = {
  id: string
  course_code: string
  title: string
  avg_rating: number | null
  is_cancelled: boolean
  semester: { id: string; name: string; phase: SemesterPhase } | null
}

type EnrollmentRow = {
  id: string
  class_id: string
  grade: GradeLetter | null
  status: string
}

type Warning = { id: string; reason: string; created_at: string; is_removed: boolean }

const gradePoints: Record<GradeLetter, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 }

export function RegistrarInstructorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [instructor, setInstructor] = useState<Instructor | null>(null)
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([])
  const [warnings, setWarnings] = useState<Warning[]>([])
  const [warnReason, setWarnReason] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!id) return
    const [p, c, w] = await Promise.all([
      supabase
        .from('profiles')
        .select('id,full_name,status,warning_count')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('classes')
        .select('id,course_code,title,avg_rating,is_cancelled,semester:semesters(id,name,phase)')
        .eq('instructor_id', id),
      supabase
        .from('warnings')
        .select('id,reason,created_at,is_removed')
        .eq('target_id', id)
        .order('created_at', { ascending: false }),
    ])
    setInstructor((p.data as Instructor | null) ?? null)
    const myClasses = (c.data as unknown as ClassRow[]) ?? []
    setClasses(myClasses)
    setWarnings((w.data as Warning[]) ?? [])

    if (myClasses.length > 0) {
      const { data: e } = await supabase
        .from('enrollments')
        .select('id,class_id,grade,status')
        .in(
          'class_id',
          myClasses.map((c) => c.id),
        )
      setEnrollments((e as EnrollmentRow[]) ?? [])
    } else {
      setEnrollments([])
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const classStats = useMemo(() => {
    return classes.map((c) => {
      const cls = enrollments.filter((e) => e.class_id === c.id && e.status === 'enrolled')
      const graded = cls.filter((e) => e.grade !== null)
      const missing = cls.length - graded.length
      const gpa =
        graded.length === 0
          ? null
          : graded.reduce((sum, e) => sum + gradePoints[e.grade as GradeLetter], 0) / graded.length
      const inGrading =
        c.semester?.phase === 'grading' || c.semester?.phase === 'closed'
      return {
        ...c,
        enrolledCount: cls.length,
        gradedCount: graded.length,
        missingGrades: missing,
        classGpa: gpa,
        inGrading,
        gpaFlag:
          gpa === null
            ? null
            : gpa > 3.5
              ? 'unusually high'
              : gpa < 2.5
                ? 'unusually low'
                : null,
      }
    })
  }, [classes, enrollments])

  async function issueWarning() {
    if (!id || !warnReason.trim()) return
    setMsg(null)
    const { error } = await supabase.rpc('rpc_warn_user', {
      p_target_id: id,
      p_reason: warnReason.trim(),
    })
    if (error) setMsg(error.message)
    else {
      setWarnReason('')
      await load()
    }
  }

  async function setStatus(next: ProfileStatus) {
    if (!id) return
    setMsg(null)
    const { error } = await supabase.from('profiles').update({ status: next }).eq('id', id)
    if (error) setMsg(error.message)
    else await load()
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>
  if (!instructor) return <p className="text-sm text-red-400">Instructor not found.</p>

  const activeWarnings = warnings.filter((w) => !w.is_removed).length
  const allCancelled = classes.length > 0 && classes.every((c) => c.is_cancelled)

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link to="/registrar/instructors" className="text-xs text-indigo-300 hover:underline">
          ← Back to instructors
        </Link>
        <h1 className="text-2xl font-semibold text-white">{instructor.full_name}</h1>
        <div className="text-sm text-zinc-500">
          Status: <span className="text-zinc-300">{instructor.status}</span> · Warnings:{' '}
          <span className="text-zinc-300">{activeWarnings}</span>
        </div>
      </div>

      {msg && <p className="text-sm text-amber-300">{msg}</p>}

      {allCancelled && (
        <div className="rounded border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          All of this instructor's classes this semester were cancelled — consider suspension.
        </div>
      )}

      <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-semibold text-white">Actions</h2>
        <div className="space-y-2">
          <label className="block text-xs text-zinc-500">Issue a warning</label>
          <div className="flex flex-wrap gap-2">
            <input
              className="min-w-[20rem] flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              value={warnReason}
              onChange={(e) => setWarnReason(e.target.value)}
              placeholder="Reason (e.g., class GPA 3.8 without justification)"
            />
            <button
              type="button"
              className="rounded bg-amber-700 px-3 py-2 text-sm text-white hover:bg-amber-600 disabled:opacity-40"
              disabled={!warnReason.trim()}
              onClick={() => void issueWarning()}
            >
              Warn instructor
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            3rd warning auto-suspends — instructor cannot teach next semester.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {instructor.status !== 'suspended' && (
            <button
              type="button"
              className="rounded border border-amber-700 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-900/40"
              onClick={() => void setStatus('suspended')}
            >
              Suspend
            </button>
          )}
          {instructor.status !== 'terminated' && (
            <button
              type="button"
              className="rounded border border-red-700 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/40"
              onClick={() => void setStatus('terminated')}
            >
              Fire
            </button>
          )}
          {instructor.status !== 'active' && (
            <button
              type="button"
              className="rounded border border-emerald-700 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-900/40"
              onClick={() => void setStatus('active')}
            >
              Reinstate
            </button>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-white">Classes</h2>
        {classStats.length === 0 ? (
          <p className="text-sm text-zinc-500">No classes assigned.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Semester</th>
                  <th className="px-4 py-2">Class</th>
                  <th className="px-4 py-2">Enrolled</th>
                  <th className="px-4 py-2">Graded</th>
                  <th className="px-4 py-2">Class GPA</th>
                  <th className="px-4 py-2">Rating</th>
                  <th className="px-4 py-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {classStats.map((c) => {
                  const flags: string[] = []
                  if (c.is_cancelled) flags.push('cancelled')
                  if (c.inGrading && c.missingGrades > 0)
                    flags.push(`${c.missingGrades} missing grades`)
                  if (c.gpaFlag) flags.push(c.gpaFlag)
                  if (c.avg_rating !== null && c.avg_rating < 2.0) flags.push('low rating')
                  return (
                    <tr key={c.id} className="border-t border-zinc-800">
                      <td className="px-4 py-2 text-zinc-300">{c.semester?.name ?? '—'}</td>
                      <td className="px-4 py-2 text-white">
                        {c.course_code} · {c.title}
                      </td>
                      <td className="px-4 py-2 text-zinc-300">{c.enrolledCount}</td>
                      <td className="px-4 py-2 text-zinc-300">{c.gradedCount}</td>
                      <td className="px-4 py-2 text-zinc-300">
                        {c.classGpa === null ? '—' : c.classGpa.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-zinc-300">{c.avg_rating ?? '—'}</td>
                      <td className="px-4 py-2 text-xs text-amber-300">
                        {flags.length === 0 ? '—' : flags.join(', ')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-white">Warnings</h2>
        {warnings.length === 0 ? (
          <p className="text-sm text-zinc-500">No warnings on record.</p>
        ) : (
          <ul className="space-y-2">
            {warnings.map((w) => (
              <li key={w.id} className="rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="text-white">{w.reason}</div>
                  <div className="text-xs text-zinc-500">
                    {new Date(w.created_at).toLocaleString()}
                  </div>
                </div>
                {w.is_removed && <div className="text-xs text-zinc-500">(removed)</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
