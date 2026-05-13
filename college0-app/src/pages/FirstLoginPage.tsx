import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { RequireAuth } from '../components/RequireRole'
import { useAuth } from '../hooks/useAuth'
import type { UserRole } from '../types/database'

type Step = 'password' | 'tutorial' | 'done'

export function FirstLoginPage() {
  const { profile, refreshProfile } = useAuth()
  const nav = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [step, setStep] = useState<Step>('password')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!profile?.first_login) {
      nav('/')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSaving(true)
    const { error: pwErr } = await supabase.auth.updateUser({ password })
    if (pwErr) {
      setSaving(false)
      setError(pwErr.message)
      return
    }
    const { error: upErr } = await supabase
      .from('profiles')
      .update({ first_login: false })
      .eq('id', profile.id)
    setSaving(false)
    if (upErr) setError(upErr.message)
    else {
      await refreshProfile()
      setStep('tutorial')
    }
  }

  function finishTutorial() {
    nav(homeForRole(profile?.role))
  }

  return (
    <RequireAuth>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
        {step === 'password' && (
          <>
            <div>
              <h1 className="text-2xl font-semibold text-white">Welcome to College0</h1>
              <p className="text-sm text-zinc-400">
                For your security, please set a new password before continuing.
              </p>
            </div>
            {!profile?.first_login ? (
              <p className="text-zinc-500">You are up to date.</p>
            ) : (
              <form
                onSubmit={changePassword}
                className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-6"
              >
                <label className="block space-y-1">
                  <span className="text-sm text-zinc-400">New password</span>
                  <input
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm text-zinc-400">Confirm password</span>
                  <input
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </label>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  {saving ? 'Saving…' : 'Save and continue'}
                </button>
              </form>
            )}
          </>
        )}

        {step === 'tutorial' && <Tutorial role={profile?.role} onDone={finishTutorial} />}
      </div>
    </RequireAuth>
  )
}

function homeForRole(role: UserRole | undefined): string {
  switch (role) {
    case 'registrar':
      return '/registrar'
    case 'instructor':
      return '/instructor'
    case 'student':
      return '/student'
    case 'visitor':
      return '/visitor'
    default:
      return '/'
  }
}

function Tutorial({ role, onDone }: { role: UserRole | undefined; onDone: () => void }) {
  const steps = tutorialSteps(role)
  const [i, setI] = useState(0)
  const cur = steps[i]
  const last = i === steps.length - 1

  return (
    <div className="space-y-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
      <div>
        <div className="text-xs uppercase tracking-wider text-zinc-500">
          Quick tour · {i + 1} of {steps.length}
        </div>
        <h2 className="mt-1 text-xl font-semibold text-white">{cur.title}</h2>
      </div>
      <div className="space-y-3 text-sm text-zinc-300">
        {cur.body.map((p, n) => (
          <p key={n}>{p}</p>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={i === 0}
          onClick={() => setI((n) => Math.max(0, n - 1))}
          className="text-xs text-zinc-400 hover:text-white disabled:opacity-30"
        >
          ← Back
        </button>
        <div className="flex gap-1">
          {steps.map((_, n) => (
            <span
              key={n}
              className={`h-1.5 w-6 rounded ${
                n === i ? 'bg-indigo-500' : n < i ? 'bg-indigo-900' : 'bg-zinc-700'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => (last ? onDone() : setI((n) => n + 1))}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
        >
          {last ? 'Got it — take me in' : 'Next →'}
        </button>
      </div>
    </div>
  )
}

function tutorialSteps(role: UserRole | undefined): { title: string; body: string[] }[] {
  if (role === 'student') {
    return [
      {
        title: 'How College0 works',
        body: [
          'Every term has four phases that run in order: Class Setup → Course Registration → Class Running → Grading.',
          'What you can do at any moment depends on the current phase. The dashboard always shows you which phase the semester is in.',
        ],
      },
      {
        title: 'Registration rules',
        body: [
          'During Course Registration, you can register for 2–4 courses.',
          'Classes must not overlap in time. If a class is full you can join the waitlist. You can only retake a course you previously failed (F grade).',
        ],
      },
      {
        title: 'Reviews & grades',
        body: [
          'During Class Running you can leave a 1–5 star anonymous review for each of your classes. Profanity is filtered and may earn you a warning.',
          'Once your instructor posts your grade, reviews for that class lock.',
        ],
      },
      {
        title: 'Graduation, complaints, and warnings',
        body: [
          'When you have passed 8 courses (including all required courses) you can apply for graduation. Applying early triggers a warning.',
          'You can file complaints against a classmate or instructor. Three active warnings will suspend you for a semester.',
        ],
      },
    ]
  }
  if (role === 'instructor') {
    return [
      {
        title: 'How College0 works',
        body: [
          'Every term has four phases: Class Setup → Course Registration → Class Running → Grading.',
          'Your sidebar gives you per-class rosters, waitlist controls, grading, anonymous reviews, and a complaint form.',
        ],
      },
      {
        title: 'Waitlist & grading',
        body: [
          'You can promote waitlisted students into your class once seats are open.',
          'Grading only opens during the Grading phase. The system refuses grade changes outside it.',
        ],
      },
      {
        title: 'Reviews & complaints',
        body: [
          'You can see every review left for your classes, but author names are hidden.',
          'You can file a complaint against any student in your classes — the registrar must act on every instructor complaint.',
        ],
      },
    ]
  }
  if (role === 'registrar') {
    return [
      {
        title: 'You are the registrar',
        body: [
          'You can run semesters through their four phases, approve or reject applications, manage students and instructors, and handle complaints.',
          'Use the sidebar on the left to navigate every section.',
        ],
      },
    ]
  }
  return [
    {
      title: 'Welcome to College0',
      body: ['Use the navigation at the top of the page to explore.'],
    },
  ]
}
