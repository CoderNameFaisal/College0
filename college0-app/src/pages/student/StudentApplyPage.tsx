import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export function StudentApplyPage() {
  const [email, setEmail] = useState('')
  const [gpa, setGpa] = useState('3.5')
  const [role, setRole] = useState<'student' | 'instructor'>('student')
  const [msg, setMsg] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    const { error } = await supabase.from('applications').insert({
      applicant_email: email,
      role_requested: role,
      prior_gpa: role === 'student' ? Number(gpa) : null,
    })
    if (error) setMsg(error.message)
    else setMsg('Application submitted.')
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold text-white">Apply to the program</h1>
      {msg && <p className="text-sm text-amber-300">{msg}</p>}
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-zinc-800 p-4">
        <input
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
          placeholder="Applicant email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <select
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
          value={role}
          onChange={(e) => setRole(e.target.value as 'student' | 'instructor')}
        >
          <option value="student">Student</option>
          <option value="instructor">Instructor</option>
        </select>
        {role === 'student' && (
          <input
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            placeholder="Prior GPA"
            value={gpa}
            onChange={(e) => setGpa(e.target.value)}
          />
        )}
        <button type="submit" className="w-full rounded bg-indigo-600 py-2 text-sm text-white">
          Submit
        </button>
      </form>
    </div>
  )
}
