import { supabase } from './supabase'

const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export async function invokeEdge<T = unknown>(
  name: string,
  body: Record<string, unknown>,
  accessToken: string | null | undefined,
): Promise<T> {
  if (!url || !anon || !accessToken) {
    throw new Error('Missing Supabase URL, anon key, or session')
  }
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: anon,
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as T & { error?: string }
  if (!res.ok) {
    throw new Error((json as { error?: string }).error ?? res.statusText)
  }
  return json
}

export async function invokeEdgeSession<T = unknown>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data } = await supabase.auth.getSession()
  // Fall back to the anon key when no user is logged in (visitor flow).
  // Edge functions that need to gate by role must verify auth.uid() themselves.
  const token = data.session?.access_token ?? anon
  return invokeEdge<T>(name, body, token)
}
