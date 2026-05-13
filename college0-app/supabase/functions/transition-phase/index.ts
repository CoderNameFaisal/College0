import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsJson, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const opt = handleCors(req)
  if (opt) return opt

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return corsJson({ error: 'Missing authorization' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) return corsJson({ error: 'Invalid session' }, 401)

    const { data: profile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'registrar') {
      return corsJson({ error: 'Only registrars may transition phases' }, 403)
    }

    const body = await req.json()
    const semester_id = body.semester_id as string
    const next_phase = body.next_phase as string
    if (!semester_id || !next_phase) {
      return corsJson({ error: 'semester_id and next_phase required' }, 400)
    }

    const { data, error } = await userClient.rpc('rpc_transition_semester_phase', {
      p_semester_id: semester_id,
      p_next_phase: next_phase,
    })
    if (error) return corsJson({ error: error.message }, 400)
    return corsJson({ ok: true, result: data })
  } catch (e) {
    return corsJson({ error: String(e) }, 500)
  }
})
