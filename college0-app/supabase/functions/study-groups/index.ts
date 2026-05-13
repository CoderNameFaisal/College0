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
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return corsJson({ error: 'OPENAI_API_KEY not configured' }, 500)

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    })
    const admin = createClient(supabaseUrl, serviceKey)

    const {
      data: { user },
    } = await userClient.auth.getUser()
    if (!user) return corsJson({ error: 'Invalid session' }, 401)

    const { class_id } = await req.json()
    if (!class_id) return corsJson({ error: 'class_id required' }, 400)

    const { data: roster } = await admin
      .from('enrollments')
      .select('student_id')
      .eq('class_id', class_id)
      .in('status', ['enrolled', 'waitlisted'])

    const peerIds = (roster ?? [])
      .map((r: { student_id: string }) => r.student_id)
      .filter((id: string) => id !== user.id)

    let peers: { id: string; name: string }[] = []
    if (peerIds.length > 0) {
      const { data: profs } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', peerIds)
      peers = (profs ?? []).map((p: { id: string; full_name: string }) => ({
        id: p.id,
        name: p.full_name,
      }))
    }

    const prompt = `Pick up to 3 study partners for student ${user.id} from: ${JSON.stringify(peers)}. Respond JSON only: {"suggestions":[{"student_id":"uuid","reason":"short"}]}`

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'Output valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      }),
    })
    if (!res.ok) return corsJson({ error: await res.text() }, 500)
    const json = await res.json()
    const raw = json.choices[0].message.content as string
    let parsed: { suggestions?: { student_id: string; reason: string }[] }
    try {
      parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, ''))
    } catch {
      parsed = { suggestions: peers.slice(0, 3).map((p) => ({ student_id: p.id, reason: 'Co-enrolled' })) }
    }

    const members = parsed.suggestions?.map((s) => s.student_id) ?? peers.map((p) => p.id).slice(0, 3)
    const { data: row, error } = await admin
      .from('study_groups')
      .insert({
        class_id,
        members,
        ai_suggested: true,
      })
      .select('id')
      .single()
    if (error) return corsJson({ error: error.message }, 400)

    return corsJson({ ok: true, study_group_id: row?.id, suggestions: parsed.suggestions })
  } catch (e) {
    return corsJson({ error: String(e) }, 500)
  }
})
