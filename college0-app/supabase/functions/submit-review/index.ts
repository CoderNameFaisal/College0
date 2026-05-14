import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsJson, handleCors } from '../_shared/cors.ts'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Count distinct taboo list entries that appear in body; return masked text using * per character. */
function tabooMaskAndCount(body: string, words: string[]): { matches: number; filtered: string } {
  const lower = body.toLowerCase()
  let filtered = body
  let matches = 0
  for (const w of words) {
    const lw = w.trim().toLowerCase()
    if (!lw || !lower.includes(lw)) continue
    matches += 1
    const re = new RegExp(escapeRegExp(w.trim()), 'gi')
    filtered = filtered.replace(re, (m) => '*'.repeat(Math.max(m.length, 1)))
  }
  return { matches, filtered }
}

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
    const starsNum = Number(stars)
    if (!Number.isFinite(starsNum) || starsNum < 1 || starsNum > 5 || !Number.isInteger(starsNum)) {
      return corsJson({ error: 'stars must be an integer 1–5' }, 400)
    }

    const { data: existing } = await admin
      .from('enrollments')
      .select('grade,status')
      .eq('student_id', user.id)
      .eq('class_id', class_id)
      .maybeSingle()
    if (!existing || existing.status !== 'enrolled') {
      return corsJson({ error: 'You must be actively enrolled in this class to submit a review.' }, 403)
    }
    if (existing?.grade) {
      return corsJson(
        { error: 'Grade already posted for this class — reviews are locked.' },
        400,
      )
    }

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
    const list = (words ?? []).map((w: { word: string }) => String(w.word ?? '').trim()).filter(Boolean)
    const { matches, filtered } = tabooMaskAndCount(String(body), list)

    const is_hidden = matches >= 3
    const bodyStored = is_hidden
      ? '[not published — severe taboo language]'
      : matches >= 1 && matches <= 2
        ? filtered
        : String(body)
    const filteredStored = matches >= 1 && matches <= 2 ? filtered : null

    const { error: insErr } = await admin.from('reviews').insert({
      class_id,
      author_id: user.id,
      stars: starsNum,
      body: bodyStored,
      filtered_body: filteredStored,
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

      const { data: cls } = await admin
        .from('classes')
        .select('semester_id')
        .eq('id', class_id)
        .maybeSingle()
      const semesterId = (cls as { semester_id?: string } | null)?.semester_id ?? null

      for (let i = 0; i < warnDelta; i++) {
        await admin.from('warnings').insert({
          target_id: user.id,
          reason:
            matches >= 3
              ? 'Severe taboo language in review (3+ matches from registrar list)'
              : 'Taboo language in review (1–2 matches from registrar list)',
          issued_by: null,
          semester_id: semesterId,
        })
      }
    }

    return corsJson({ ok: true, matches, is_hidden })
  } catch (e) {
    return corsJson({ error: String(e) }, 500)
  }
})
