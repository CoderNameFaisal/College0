import { Navigate } from 'react-router-dom'
import { useAuth, useRole } from '../hooks/useAuth'
import type { UserRole } from '../types/database'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="text-zinc-500">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function RequireRole({
  allow,
  children,
}: {
  allow: UserRole[]
  children: React.ReactNode
}) {
  const role = useRole()
  const { profile, loading } = useAuth()
  if (loading || !profile) return <p className="text-zinc-500">Loading…</p>
  if (!role || !allow.includes(role)) return <Navigate to="/" replace />
  return <>{children}</>
}

export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading, profile } = useAuth()
  if (loading) return <p className="text-zinc-500">Loading…</p>
  if (user && profile?.first_login) return <Navigate to="/first-login" replace />
  if (user) return <Navigate to="/account" replace />
  return <>{children}</>
}
