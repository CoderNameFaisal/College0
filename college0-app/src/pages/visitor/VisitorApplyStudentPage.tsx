import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export function VisitorApplyStudentPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [priorGpa, setPriorGpa] = useState('')
  const [qualifications, setQualifications] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const gpa = priorGpa.trim() === '' ? null : Number(priorGpa)
    if (gpa !== null && (Number.isNaN(gpa) || gpa < 0 || gpa > 4)) {
      setErr('Prior GPA must be a number between 0 and 4.')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.from('applications').insert({
      applicant_name: fullName.trim(),
      applicant_email: email.trim(),
      role_requested: 'student',
      prior_gpa: gpa,
      qualifications: qualifications.trim() || null,
    })
    setSubmitting(false)
    if (error) setErr(error.message)
    else setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-lg border border-emerald-700/60 bg-emerald-950/40 p-6">
        <h1 className="text-2xl font-semibold text-emerald-200">Application received</h1>
        <p className="text-sm text-emerald-100">
          Thanks, {fullName || 'applicant'}. Your application is now <strong>pending</strong>{' '}
          registrar review.
        </p>
        <p className="text-sm text-emerald-100/80">
          When the registrar <strong>accepts</strong> your application, you will receive login
          credentials (student ID and a temporary password) from the registrar. If you are{' '}
          <strong>rejected</strong>, you will see the status update here when you check back.
        </p>
        <div className="pt-2">
          <Link to="/" className="text-sm text-emerald-300 underline">
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Apply as a student</h1>
        <p className="text-sm text-zinc-400">
          The registrar reviews every application. If your prior GPA is <strong>3.0 or higher</strong> and
          active students are below the current term quota (registration, running, or grading phase), you
          must be accepted unless the registrar documents an override.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-6"
      >
        {err && (
          <p className="rounded border border-red-700/60 bg-red-950/30 p-2 text-sm text-red-200">
            {err}
          </p>
        )}

        <Field label="Full name" required>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            placeholder="Jane Doe"
          />
        </Field>

        <Field label="Email" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            placeholder="jane@example.com"
          />
        </Field>

        <Field label="Prior GPA (0.0 – 4.0)">
          <input
            type="number"
            min={0}
            max={4}
            step="0.01"
            value={priorGpa}
            onChange={(e) => setPriorGpa(e.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            placeholder="3.5"
          />
        </Field>

        <Field label="Additional info (optional)">
          <textarea
            value={qualifications}
            onChange={(e) => setQualifications(e.target.value)}
            rows={3}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            placeholder="Anything else the registrar should know — relevant coursework, transfer credits, etc."
          />
        </Field>

        <div className="flex items-center justify-between pt-2">
          <Link to="/" className="text-xs text-zinc-400 hover:text-white">
            ← Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || !fullName.trim() || !email.trim()}
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-zinc-500">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </span>
      {children}
    </label>
  )
}
