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
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    })
    const admin = createClient(supabaseUrl, serviceKey)

    const {
      data: { user },
    } = await userClient.auth.getUser()
    if (!user) return corsJson({ error: 'Invalid session' }, 401)

    const { class_id, stars, body } = await req.json()
    if (!class_id || !stars || !body) {
      return corsJson({ error: 'class_id, stars, body required' }, 400)
    }

    // Reviews are locked once the student has been graded for this class.
    const { data: existing } = await admin
      .from('enrollments')
      .select('grade')
      .eq('student_id', user.id)
      .eq('class_id', class_id)
      .maybeSingle()
    if (existing?.grade) {
      return corsJson(
        { error: 'Grade already posted for this class — reviews are locked.' },
        400,
      )
    }

    // Reviews can only be submitted during the Class Running phase.
    const { data: classRow } = await admin
      .from('classes')
      .select('semester:semesters(phase)')
      .eq('id', class_id)
      .maybeSingle()
    const phase = (classRow as { semester: { phase: string } | null } | null)?.semester?.phase
    if (phase !== 'running') {
      return corsJson(
        {
          error: `Reviews can only be submitted during the class running phase (current phase: ${phase ?? 'unknown'}).`,
        },
        400,
      )
    }

    const { data: words } = await admin.from('taboo_words').select('word')
    const list = (words ?? []).map((w: { word: string }) => w.word.toLowerCase())
    const lower = String(body).toLowerCase()
    let matches = 0
    for (const w of list) {
      if (w && lower.includes(w)) matches += 1
    }

    let filtered = String(body)
    for (const w of list) {
      if (!w) continue
      const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      filtered = filtered.replace(re, '***')
    }

    const is_hidden = matches >= 3
    const { error: insErr } = await userClient.from('reviews').insert({
      class_id,
      author_id: user.id,
      stars: Number(stars),
      body,
      filtered_body: filtered,
      is_hidden,
    })
    if (insErr) return corsJson({ error: insErr.message }, 400)

    const warnDelta = matches >= 3 ? 2 : matches >= 1 && matches <= 2 ? 1 : 0
    if (warnDelta > 0) {
      const { data: prof } = await admin
        .from('profiles')
        .select('warning_count')
        .eq('id', user.id)
        .single()
      const next = (prof?.warning_count ?? 0) + warnDelta
      await admin.from('profiles').update({ warning_count: next }).eq('id', user.id)
      for (let i = 0; i < warnDelta; i++) {
        await admin.from('warnings').insert({
          target_id: user.id,
          reason:
            matches >= 3
              ? 'Severe taboo language in review (3+ matches)'
              : 'Taboo language in review (1–2 matches)',
          issued_by: null,
        })
      }
    }

    return corsJson({ ok: true, matches, is_hidden })
  } catch (e) {
    return corsJson({ error: String(e) }, 500)
  }
})
