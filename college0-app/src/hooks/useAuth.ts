import { useContext } from 'react'
import type { UserRole } from '../types/database'
import { AuthContext } from '../contexts/auth-context'

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function useRole(): UserRole | null {
  const { profile } = useAuth()
  return profile?.role ?? null
}
