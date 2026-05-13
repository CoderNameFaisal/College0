import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { UserRole } from '../types/database'
import { RedirectIfAuthed } from '../components/RequireRole'

export function SignupPage() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('student')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    })
    if (err) setError(err.message)
    else nav('/')
  }

  return (
    <RedirectIfAuthed>
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-2xl font-semibold text-white">Sign up</h1>
        <p className="text-sm text-zinc-500">
          First registrar account should be promoted in SQL (see README). Default public signup is student or visitor.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm text-zinc-400">Full name</span>
            <input
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-zinc-400">Role</span>
            <select
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              <option value="student">Student</option>
              <option value="visitor">Visitor (read-only directory)</option>
              <option value="instructor">Instructor</option>
              <option value="registrar">Registrar</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-zinc-400">Email</span>
            <input
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-zinc-400">Password</span>
            <input
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            className="w-full rounded bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Create account
          </button>
        </form>
        <p className="text-sm text-zinc-500">
          Already have an account? <Link to="/login" className="text-indigo-400 hover:underline">Log in</Link>
        </p>
      </div>
    </RedirectIfAuthed>
  )
}
