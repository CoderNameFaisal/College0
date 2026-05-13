import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { invokeEdgeSession } from '../../lib/invokeEdge'
import type { AppRoleRequested, AppStatus } from '../../types/database'

type AppRow = {
  id: string
  applicant_email: string
  applicant_name: string | null
  qualifications: string | null
  role_requested: AppRoleRequested
  prior_gpa: number | null
  status: AppStatus
  rejection_reason: string | null
  created_at: string
}

type Decision = {
  justification: string
  fullName: string
}

type AcceptResult = {
  application_id: string
  email: string
  student_id: string
  temp_password: string
}

export function RegistrarApplicationsPage() {
  const [rows, setRows] = useState<AppRow[]>([])
  const [activeStudents, setActiveStudents] = useState(0)
  const [quota, setQuota] = useState<number | null>(null)
  const [showDecided, setShowDecided] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, Decision>>({})
  const [acceptResult, setAcceptResult] = useState<AcceptResult | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const q = supabase
      .from('applications')
      .select(
        'id,applicant_email,applicant_name,qualifications,role_requested,prior_gpa,status,rejection_reason,created_at',
      )
      .order('created_at', { ascending: false })
    const [apps, sem, studentsCount] = await Promise.all([
      showDecided ? q : q.eq('status', 'pending'),
      supabase
        .from('semesters')
        .select('quota,phase')
        .in('phase', ['setup', 'registration'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'student')
        .eq('status', 'active'),
    ])
    setRows((apps.data as AppRow[]) ?? [])
    setQuota(sem.data?.quota ?? null)
    setActiveStudents(studentsCount.count ?? 0)
    setLoading(false)
  }, [showDecided])

  useEffect(() => {
    void load()
  }, [load])

  function draft(id: string) {
    return drafts[id] ?? { justification: '', fullName: '' }
  }

  function updateDraft(id: string, patch: Partial<Decision>) {
    setDrafts((d) => ({ ...d, [id]: { ...draft(id), ...patch } }))
  }

  function mustAcceptStudent(a: AppRow) {
    return (
      a.role_requested === 'student' &&
      a.prior_gpa !== null &&
      a.prior_gpa > 3.0 &&
      quota !== null &&
      activeStudents < quota
    )
  }

  async function acceptStudent(a: AppRow) {
    setMsg(null)
    const d = draft(a.id)
    const isOverride = !mustAcceptStudent(a)
    if (isOverride && !d.justification.trim()) {
      setMsg('Justification required to accept this applicant.')
      return
    }
    try {
      const res = await invokeEdgeSession<AcceptResult & { ok: boolean }>(
        'accept-student-application',
        {
          application_id: a.id,
          justification: d.justification.trim() || null,
          full_name: d.fullName.trim() || null,
        },
      )
      setAcceptResult({
        application_id: a.id,
        email: res.email ?? a.applicant_email,
        student_id: res.student_id,
        temp_password: res.temp_password,
      })
      setDrafts((dr) => ({ ...dr, [a.id]: { justification: '', fullName: '' } }))
      await load()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    }
  }

  async function rejectApp(a: AppRow) {
    setMsg(null)
    const d = draft(a.id)
    const isOverride = a.role_requested === 'student' && mustAcceptStudent(a)
    if (isOverride && !d.justification.trim()) {
      setMsg('Justification required to reject a qualified applicant.')
      return
    }
    const { error } = await supabase.rpc('rpc_decide_application', {
      p_application_id: a.id,
      p_status: 'rejected',
      p_justification: d.justification.trim() || null,
    })
    if (error) setMsg(error.message)
    else {
      setDrafts((dr) => ({ ...dr, [a.id]: { justification: '', fullName: '' } }))
      await load()
    }
  }

  async function acceptInstructor(a: AppRow) {
    setMsg(null)
    const { error } = await supabase.rpc('rpc_decide_application', {
      p_application_id: a.id,
      p_status: 'accepted',
      p_justification: null,
    })
    if (error) setMsg(error.message)
    else {
      setMsg(
        `Instructor application accepted. Have ${a.applicant_email} sign up via the public signup page; you can then assign classes from the instructor detail page.`,
      )
      await load()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Applications</h1>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={showDecided}
            onChange={(e) => setShowDecided(e.target.checked)}
          />
          Show decided
        </label>
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">
        Active student quota: <span className="text-white">{activeStudents}</span> of{' '}
        <span className="text-white">{quota ?? '—'}</span> filled.
        {' '}Rule: GPA &gt; 3.0 + quota available → must accept (justification needed to override either
        way).
      </div>

      {msg && <p className="text-sm text-amber-300">{msg}</p>}

      {acceptResult && (
        <div className="rounded-lg border border-emerald-700 bg-emerald-950/40 p-4 text-sm">
          <p className="font-semibold text-emerald-200">Student account created</p>
          <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-zinc-200">
            <dt className="text-zinc-500">Email</dt>
            <dd>{acceptResult.email}</dd>
            <dt className="text-zinc-500">Student ID</dt>
            <dd className="font-mono">{acceptResult.student_id}</dd>
            <dt className="text-zinc-500">Temp password</dt>
            <dd className="font-mono">{acceptResult.temp_password}</dd>
          </dl>
          <p className="mt-2 text-xs text-zinc-400">
            Deliver these credentials to the applicant. They'll be prompted to change the password on
            first login.
          </p>
          <button
            type="button"
            onClick={() => setAcceptResult(null)}
            className="mt-2 text-xs text-zinc-300 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No applications to show.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((a) => {
            const d = draft(a.id)
            const isStudent = a.role_requested === 'student'
            const expected = isStudent ? (mustAcceptStudent(a) ? 'accept' : 'reject') : null
            return (
              <li key={a.id} className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <div className="text-sm text-white">
                      {a.applicant_name || '(name not provided)'}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {a.applicant_email} · {a.role_requested} · GPA: {a.prior_gpa ?? '—'} ·{' '}
                      {new Date(a.created_at).toLocaleString()}
                    </div>
                    {a.qualifications && (
                      <p className="mt-2 max-w-2xl whitespace-pre-wrap rounded bg-zinc-950/40 p-2 text-xs text-zinc-300">
                        {a.qualifications}
                      </p>
                    )}
                  </div>
                  <div className="text-xs">
                    <span
                      className={
                        a.status === 'pending'
                          ? 'text-amber-300'
                          : a.status === 'accepted'
                            ? 'text-emerald-300'
                            : 'text-red-300'
                      }
                    >
                      {a.status}
                    </span>
                  </div>
                </div>

                {a.status === 'pending' && (
                  <>
                    {isStudent && (
                      <p className="text-xs text-zinc-400">
                        Auto-rule:{' '}
                        {expected === 'accept' ? (
                          <span className="text-emerald-300">should accept</span>
                        ) : (
                          <span className="text-red-300">should reject</span>
                        )}{' '}
                        (overriding requires justification)
                      </p>
                    )}

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                        placeholder={isStudent ? "Full name (optional, defaults to email's local part)" : 'Full name (used at signup)'}
                        value={d.fullName}
                        onChange={(e) => updateDraft(a.id, { fullName: e.target.value })}
                      />
                      <input
                        className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                        placeholder="Justification (required to override the auto-rule)"
                        value={d.justification}
                        onChange={(e) => updateDraft(a.id, { justification: e.target.value })}
                      />
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => (isStudent ? void acceptStudent(a) : void acceptInstructor(a))}
                        className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => void rejectApp(a)}
                        className="rounded bg-zinc-700 px-3 py-1.5 text-sm text-white hover:bg-zinc-600"
                      >
                        Reject
                      </button>
                    </div>
                  </>
                )}

                {a.status !== 'pending' && a.rejection_reason && (
                  <p className="text-xs text-zinc-500">Notes: {a.rejection_reason}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
