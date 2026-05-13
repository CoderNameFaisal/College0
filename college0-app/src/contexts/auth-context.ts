import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { ProfileRow } from '../types/database'

export type AuthState = {
  user: User | null
  session: Session | null
  profile: ProfileRow | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | undefined>(undefined)
