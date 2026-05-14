import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useStudentOperationalTerm } from '../hooks/useStudentOperationalTerm'

export function AccountPage() {
  const { user, profile, refreshProfile } = useAuth()
  const { semester: opSem, enrollments: termEnr, catalogCount, loading: termLoading } =
    useStudentOperationalTerm(user?.id, profile?.role ?? null)
  const [fullName, setFullName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '')
      setStudentId(profile.student_id ?? '')
    }
  }, [profile])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setErr(null)
    setMsg(null)
    setSavingProfile(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          student_id: studentId.trim() || null,
        })
        .eq('id', user.id)
      if (error) setErr(error.message)
      else {
        setMsg('Profile saved.')
        await refreshProfile()
      }
    } finally {
      setSavingProfile(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    if (newPassword.length < 8) {
      setErr('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setErr('Passwords do not match.')
      return
    }
    setSavingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) setErr(error.message)
      else {
        setMsg('Password updated.')
        setNewPassword('')
        setConfirmPassword('')
      }
    } finally {
      setSavingPassword(false)
    }
  }

  const input =
    'w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

  return (
    <div className="mx-auto max-w-lg space-y-8">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-white">Account</h1>
        <p className="mt-1 text-sm text-zinc-400">Update your profile and sign-in password.</p>
        {profile && (
          <p className="mt-2 text-xs text-zinc-500">
            <span className="text-zinc-400">Your role</span> is{' '}
            <span className="font-medium capitalize text-zinc-300">{profile.role}</span> — it is set when
            your account is created and cannot be changed here.
          </p>
        )}
      </div>

        {msg && <p className="rounded-lg border border-emerald-800/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{msg}</p>}
        {err && <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">{err}</p>}

        {profile?.role === 'student' && (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Current semester</h2>
            {termLoading ? (
              <p className="mt-3 text-sm text-zinc-500">Loading…</p>
            ) : !opSem ? (
              <p className="mt-3 text-sm text-zinc-500">
                No semester is in registration, running, or grading right now.
              </p>
            ) : (
              <div className="mt-3 space-y-3 text-sm">
                <p className="text-zinc-300">
                  <span className="text-white">{opSem.name}</span>{' '}
                  <span className="text-zinc-500">({opSem.phase})</span>
                  {catalogCount != null && (
                    <span className="block text-xs text-zinc-500">
                      {catalogCount} section{catalogCount === 1 ? '' : 's'} listed for registration / this
                      term.
                    </span>
                  )}
                </p>
                {termEnr.length === 0 ? (
                  <p className="text-zinc-500">
                    You are not enrolled in any sections for this term yet. Open{' '}
                    <Link to="/student/enroll" className="text-indigo-300 hover:underline">
                      Course registration
                    </Link>{' '}
                    to browse and enroll.
                  </p>
                ) : (
                  <ul className="space-y-1.5 rounded border border-zinc-800/80 bg-zinc-950/40 p-3">
                    {termEnr.map((e) => (
                      <li key={e.id} className="text-zinc-200">
                        <span className="text-white">
                          {e.class?.course_code ?? '?'} · {e.class?.title ?? 'Class'}
                        </span>
                        <span className="ml-2 text-xs text-zinc-500">{e.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  to="/student/enroll"
                  className="inline-block text-xs font-medium text-indigo-300 hover:underline"
                >
                  Go to course registration →
                </Link>
              </div>
            )}
          </section>
        )}

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Profile</h2>
          <form onSubmit={saveProfile} className="mt-4 space-y-4">
            <label className="block text-sm">
              <span className="text-zinc-400">Email</span>
              <input className={`${input} mt-1 bg-zinc-950/80 text-zinc-500`} readOnly value={user?.email ?? ''} />
            </label>
            <label className="block text-sm">
              <span className="text-zinc-400">Full name</span>
              <input className={`${input} mt-1`} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </label>
            {profile?.role === 'student' && (
              <label className="block text-sm">
                <span className="text-zinc-400">Student ID</span>
                <input
                  className={`${input} mt-1`}
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="Optional"
                />
              </label>
            )}
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Password</h2>
          <form onSubmit={changePassword} className="mt-4 space-y-4">
            <label className="block text-sm">
              <span className="text-zinc-400">New password</span>
              <input
                className={`${input} mt-1`}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
              />
            </label>
            <label className="block text-sm">
              <span className="text-zinc-400">Confirm new password</span>
              <input
                className={`${input} mt-1`}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
              />
            </label>
            <button
              type="submit"
              disabled={savingPassword || !newPassword}
              className="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60"
            >
              {savingPassword ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </section>
      </div>
  )
}
