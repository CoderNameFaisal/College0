import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { EnrollmentStatus, GradeLetter, ProfileStatus } from '../../types/database'

type Student = {
  id: string
  full_name: string
  student_id: string | null
  status: ProfileStatus
  warning_count: number
  cumulative_gpa: number | null
  honor_roll_count: number
}

type Warning = {
  id: string
  reason: string
  created_at: string
  is_removed: boolean
}

type Fine = {
  id: string
  amount: number
  reason: string
  paid: boolean
  created_at: string
}

type EnrollmentRow = {
  id: string
  status: EnrollmentStatus
  grade: GradeLetter | null
  enrolled_at: string
  class: {
    course_code: string
    title: string
    semester: { name: string; phase: string } | null
  } | null
}

export function RegistrarStudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [student, setStudent] = useState<Student | null>(null)
  const [warnings, setWarnings] = useState<Warning[]>([])
  const [fines, setFines] = useState<Fine[]>([])
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([])
  const [warnReason, setWarnReason] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!id) return
    const [p, w, f, e] = await Promise.all([
      supabase
        .from('profiles')
        .select('id,full_name,student_id,status,warning_count,cumulative_gpa,honor_roll_count')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('warnings')
        .select('id,reason,created_at,is_removed')
        .eq('target_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('fines')
        .select('id,amount,reason,paid,created_at')
        .eq('student_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('enrollments')
        .select(
          'id,status,grade,enrolled_at,class:classes(course_code,title,semester:semesters(name,phase))',
        )
        .eq('student_id', id)
        .order('enrolled_at', { ascending: false }),
    ])
    setStudent((p.data as Student | null) ?? null)
    setWarnings((w.data as Warning[]) ?? [])
    setFines((f.data as Fine[]) ?? [])
    setEnrollments((e.data as unknown as EnrollmentRow[]) ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

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

  async function markFinePaid(fineId: string) {
    const { error } = await supabase.from('fines').update({ paid: true }).eq('id', fineId)
    if (error) setMsg(error.message)
    else await load()
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>
  if (!student) return <p className="text-sm text-red-400">Student not found.</p>

  const activeWarnings = warnings.filter((w) => !w.is_removed).length
  const needsInterview =
    student.status === 'active' &&
    student.cumulative_gpa !== null &&
    student.cumulative_gpa >= 2.0 &&
    student.cumulative_gpa < 2.25

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link to="/registrar/students" className="text-xs text-indigo-300 hover:underline">
          ← Back to students
        </Link>
        <h1 className="text-2xl font-semibold text-white">{student.full_name}</h1>
        <div className="text-sm text-zinc-500">
          ID: {student.student_id ?? '—'} · Status: <span className="text-zinc-300">{student.status}</span>
        </div>
      </div>

      {msg && <p className="text-sm text-amber-300">{msg}</p>}

      {needsInterview && (
        <div className="rounded border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          GPA between 2.0 and 2.25 — interview required. Issuing a warning will mark the meeting on the
          student's record.
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cumulative GPA" value={student.cumulative_gpa ?? '—'} />
        <Stat label="Warnings" value={activeWarnings} />
        <Stat label="Honor roll count" value={student.honor_roll_count} />
        <Stat label="Status" value={student.status} />
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-semibold text-white">Actions</h2>
        <div className="space-y-2">
          <label className="block text-xs text-zinc-500">Issue a warning</label>
          <div className="flex flex-wrap gap-2">
            <input
              className="min-w-[20rem] flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              value={warnReason}
              onChange={(e) => setWarnReason(e.target.value)}
              placeholder="Reason for warning"
            />
            <button
              type="button"
              className="rounded bg-amber-700 px-3 py-2 text-sm text-white hover:bg-amber-600 disabled:opacity-40"
              disabled={!warnReason.trim()}
              onClick={() => void issueWarning()}
            >
              Warn student
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            3rd warning auto-suspends the student and issues a $500 fine.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {student.status !== 'suspended' && (
            <button
              type="button"
              className="rounded border border-amber-700 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-900/40"
              onClick={() => void setStatus('suspended')}
            >
              Suspend
            </button>
          )}
          {student.status !== 'terminated' && (
            <button
              type="button"
              className="rounded border border-red-700 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/40"
              onClick={() => void setStatus('terminated')}
            >
              Terminate
            </button>
          )}
          {student.status !== 'active' && (
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
        <h2 className="text-sm font-semibold text-white">Warnings</h2>
        {warnings.length === 0 ? (
          <p className="text-sm text-zinc-500">No warnings on record.</p>
        ) : (
          <ul className="space-y-2">
            {warnings.map((w) => (
              <li key={w.id} className="rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="text-white">{w.reason}</div>
                  <div className="text-xs text-zinc-500">{new Date(w.created_at).toLocaleString()}</div>
                </div>
                {w.is_removed && <div className="text-xs text-zinc-500">(removed)</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-white">Fines</h2>
        {fines.length === 0 ? (
          <p className="text-sm text-zinc-500">No fines on record.</p>
        ) : (
          <ul className="space-y-2">
            {fines.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm"
              >
                <div>
                  <div className="text-white">${Number(f.amount).toFixed(2)} · {f.reason}</div>
                  <div className="text-xs text-zinc-500">{new Date(f.created_at).toLocaleString()}</div>
                </div>
                {f.paid ? (
                  <span className="text-xs text-emerald-300">paid</span>
                ) : (
                  <button
                    type="button"
                    className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                    onClick={() => void markFinePaid(f.id)}
                  >
                    Mark paid
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-white">Enrollment history</h2>
        {enrollments.length === 0 ? (
          <p className="text-sm text-zinc-500">No enrollments on record.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Semester</th>
                  <th className="px-4 py-2">Course</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Grade</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((e) => (
                  <tr key={e.id} className="border-t border-zinc-800">
                    <td className="px-4 py-2 text-zinc-300">{e.class?.semester?.name ?? '—'}</td>
                    <td className="px-4 py-2 text-white">
                      {e.class ? `${e.class.course_code} · ${e.class.title}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-zinc-300">{e.status}</td>
                    <td className="px-4 py-2 text-zinc-300">{e.grade ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  )
}
