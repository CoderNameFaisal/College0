import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export function VisitorApplyInstructorPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [qualifications, setQualifications] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!qualifications.trim()) {
      setErr('Please describe your qualifications.')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.from('applications').insert({
      applicant_name: fullName.trim(),
      applicant_email: email.trim(),
      role_requested: 'instructor',
      qualifications: qualifications.trim(),
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
          If accepted, you'll be invited to sign up at <code>{email}</code>. The registrar will
          assign your classes from there.
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
        <h1 className="text-2xl font-semibold text-white">Apply as an instructor</h1>
        <p className="text-sm text-zinc-400">
          Tell us about your teaching background and qualifications. The registrar reviews every
          instructor application individually.
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
            placeholder="Dr. Pat Lee"
          />
        </Field>

        <Field label="Email" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            placeholder="pat@example.edu"
          />
        </Field>

        <Field label="Qualifications" required>
          <textarea
            value={qualifications}
            onChange={(e) => setQualifications(e.target.value)}
            rows={6}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            placeholder="Degrees, prior teaching experience, subjects you're qualified to teach, publications, etc."
          />
        </Field>

        <div className="flex items-center justify-between pt-2">
          <Link to="/" className="text-xs text-zinc-400 hover:text-white">
            ← Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || !fullName.trim() || !email.trim() || !qualifications.trim()}
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
