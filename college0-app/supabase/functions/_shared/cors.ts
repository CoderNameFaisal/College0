import type { UserRole } from '../types/database'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function corsJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function handleCors(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}

export function roleFromProfile(
  role: string | null,
): 'registrar' | 'instructor' | 'student' | 'visitor' {
  const r = role as UserRole
  if (r === 'registrar' || r === 'instructor' || r === 'student' || r === 'visitor')
    return r
  return 'student'
}
