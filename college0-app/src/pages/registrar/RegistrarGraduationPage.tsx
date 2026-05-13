import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { GradAppStatus, GradeLetter } from '../../types/database'

type GradApp = {
  id: string
  status: GradAppStatus
  notes: string | null
  created_at: string
  student: { id: string; full_name: string; student_id: string | null; cumulative_gpa: number | null } | null
  semester: { id: string; name: string } | null
}

type EnrollmentDot = {
  student_id: string
  grade: GradeLetter | null
  class: { course_code: string } | null
}

type RequiredCourse = { course_code: string; title: string }

export function RegistrarGraduationPage() {
  const [rows, setRows] = useState<GradApp[]>([])
  const [enrollments, setEnrollments] = useState<EnrollmentDot[]>([])
  const [required, setRequired] = useState<RequiredCourse[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [showDecided, setShowDecided] = useState(false)
  const [notesById, setNotesById] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const q = supabase
      .from('graduation_applications')
      .select(
        'id,status,notes,created_at,student:profiles!graduation_applications_student_id_fkey(id,full_name,student_id,cumulative_gpa),semester:semesters(id,name)',
      )
      .order('created_at', { ascending: false })
    const [apps, req] = await Promise.all([
      showDecided ? q : q.eq('status', 'pending'),
      supabase.from('required_courses').select('course_code,title').order('course_code'),
    ])
    const appData = (apps.data as unknown as GradApp[]) ?? []
    setRows(appData)
    setRequired((req.data as RequiredCourse[]) ?? [])

    const studentIds = appData
      .map((r) => r.student?.id)
      .filter((x): x is string => Boolean(x))
    if (studentIds.length > 0) {
      const { data } = await supabase
        .from('enrollments')
        .select('student_id,grade,class:classes(course_code)')
        .in('student_id', studentIds)
        .eq('status', 'enrolled')
        .not('grade', 'is', null)
      setEnrollments((data as unknown as EnrollmentDot[]) ?? [])
    } else {
      setEnrollments([])
    }
    setLoading(false)
  }, [showDecided])

  useEffect(() => {
    void load()
  }, [load])

  function progress(studentId: string) {
    const passing = enrollments.filter(
      (e) => e.student_id === studentId && e.grade !== null && e.grade !== 'F',
    )
    const passingCodes = new Set(passing.map((e) => e.class?.course_code).filter(Boolean))
    const missingRequired = required.filter((rc) => !passingCodes.has(rc.course_code))
    return {
      passingCount: passingCodes.size,
      missingRequired,
    }
  }

  async function decide(id: string, decision: GradAppStatus) {
    setMsg(null)
    const { error } = await supabase.rpc('rpc_decide_graduation_application', {
      p_app_id: id,
      p_decision: decision,
      p_notes: notesById[id]?.trim() || null,
    })
    if (error) setMsg(error.message)
    else {
      setNotesById((n) => ({ ...n, [id]: '' }))
      await load()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Graduation applications</h1>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={showDecided}
            onChange={(e) => setShowDecided(e.target.checked)}
          />
          Show decided
        </label>
      </div>

      {msg && <p className="text-sm text-amber-300">{msg}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No graduation applications to show.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => {
            const sid = r.student?.id
            const prog = sid ? progress(sid) : { passingCount: 0, missingRequired: required }
            const eligible = prog.passingCount >= 8 && prog.missingRequired.length === 0
            return (
              <li key={r.id} className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <div className="text-sm text-white">{r.student?.full_name ?? '—'}</div>
                    <div className="text-xs text-zinc-500">
                      ID: {r.student?.student_id ?? '—'} · Cumulative GPA:{' '}
                      {r.student?.cumulative_gpa ?? '—'} · Semester: {r.semester?.name ?? '—'}
                    </div>
                  </div>
                  <div className="text-xs">
                    <span
                      className={
                        r.status === 'pending'
                          ? 'text-amber-300'
                          : r.status === 'approved'
                            ? 'text-emerald-300'
                            : 'text-red-300'
                      }
                    >
                      {r.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded border border-zinc-800 p-3 text-sm">
                    <div className="text-xs uppercase tracking-wider text-zinc-500">Courses passed</div>
                    <div className="mt-1 text-white">
                      {prog.passingCount} / 8{' '}
                      <span className={prog.passingCount >= 8 ? 'text-emerald-300' : 'text-amber-300'}>
                        {prog.passingCount >= 8 ? '✓' : 'short'}
                      </span>
                    </div>
                  </div>
                  <div className="rounded border border-zinc-800 p-3 text-sm">
                    <div className="text-xs uppercase tracking-wider text-zinc-500">Missing required</div>
                    <div className="mt-1 text-white">
                      {prog.missingRequired.length === 0 ? (
                        <span className="text-emerald-300">All complete</span>
                      ) : (
                        prog.missingRequired.map((c) => c.course_code).join(', ')
                      )}
                    </div>
                  </div>
                </div>

                {r.notes && <p className="text-xs text-zinc-500">Notes: {r.notes}</p>}

                {r.status === 'pending' && (
                  <div className="space-y-2 border-t border-zinc-800 pt-3">
                    {!eligible && (
                      <p className="text-xs text-amber-300">
                        Premature application — rejecting will issue a warning to the student.
                      </p>
                    )}
                    <input
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                      placeholder="Notes (optional)"
                      value={notesById[r.id] ?? ''}
                      onChange={(e) => setNotesById((n) => ({ ...n, [r.id]: e.target.value }))}
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={!eligible}
                        title={eligible ? undefined : 'Requirements not met'}
                        onClick={() => void decide(r.id, 'approved')}
                        className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600 disabled:opacity-40"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void decide(r.id, 'rejected')}
                        className="rounded bg-zinc-700 px-3 py-1.5 text-sm text-white hover:bg-zinc-600"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
