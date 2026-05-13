import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsJson, handleCors, roleFromProfile } from '../_shared/cors.ts'

async function embed(apiKey: string, input: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return json.data[0].embedding as number[]
}

async function chatComplete(
  apiKey: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      temperature: 0.4,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return json.choices[0].message.content as string
}

Deno.serve(async (req) => {
  const opt = handleCors(req)
  if (opt) return opt

  try {
    const authHeader = req.headers.get('Authorization')
    // Authorization is required so the gateway routes the call, but we accept
    // unauthenticated (visitor) calls that pass only the anon key as bearer.
    if (!authHeader) return corsJson({ error: 'Missing authorization' }, 401)

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return corsJson({ error: 'OPENAI_API_KEY not configured' }, 500)

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

    // Anon visitor (no Supabase session): role = 'visitor', no profile.
    let profile: { role: string | null; full_name: string | null; status: string | null } | null = null
    if (user) {
      const { data } = await userClient
        .from('profiles')
        .select('role, full_name, status')
        .eq('id', user.id)
        .single()
      profile = data as typeof profile
    }

    const role = user ? roleFromProfile(profile?.role ?? null) : 'visitor'
    const { message } = await req.json()
    if (!message || typeof message !== 'string') {
      return corsJson({ error: 'message required' }, 400)
    }

    const vec = await embed(openaiKey, message)
    const vecLiteral = `[${vec.join(',')}]`

    const { data: chunks, error: matchErr } = await admin.rpc('match_documents', {
      query_embedding: vecLiteral,
      match_count: 6,
    })
    if (matchErr) return corsJson({ error: matchErr.message }, 400)

    const context =
      (chunks as { content: string; metadata?: Record<string, unknown> }[] | null)
        ?.map((c) => c.content)
        .join('\n---\n') ?? ''

    // Instructors get an extra context block listing their classes + rosters
    // so the assistant can answer questions about their students.
    let instructorContext = ''
    if (role === 'instructor' && user) {
      const { data: rows } = await userClient
        .from('classes')
        .select(
          'course_code,title,enrollments(status,grade,student:profiles(full_name,student_id,cumulative_gpa,warning_count))',
        )
        .eq('instructor_id', user.id)
      if (rows && rows.length > 0) {
        instructorContext =
          '\n\nINSTRUCTOR CLASSES:\n' +
          (rows as unknown as Array<{
            course_code: string
            title: string
            enrollments: Array<{
              status: string
              grade: string | null
              student: { full_name: string; student_id: string | null; cumulative_gpa: number | null; warning_count: number } | null
            }>
          }>)
            .map((r) => {
              const roster = r.enrollments
                .map(
                  (e) =>
                    `  - ${e.student?.full_name ?? '?'} (id ${e.student?.student_id ?? '?'}, GPA ${e.student?.cumulative_gpa ?? '—'}, warnings ${e.student?.warning_count ?? 0}, status ${e.status}, grade ${e.grade ?? '—'})`,
                )
                .join('\n')
              return `${r.course_code} · ${r.title}\n${roster || '  (no enrollments)'}`
            })
            .join('\n')
      }
    }

    // Students get a context block describing their current enrollments so the
    // assistant can answer questions about their own schedule, instructors,
    // and grades.
    let studentContext = ''
    if (role === 'student' && user) {
      const { data: rows } = await userClient
        .from('enrollments')
        .select(
          'status,grade,class:classes(course_code,title,schedule_time,instructor:profiles!classes_instructor_id_fkey(full_name),semester:semesters(name,phase))',
        )
        .eq('student_id', user.id)
        .neq('status', 'dropped')
      if (rows && rows.length > 0) {
        studentContext =
          '\n\nSTUDENT ENROLLMENTS:\n' +
          (rows as unknown as Array<{
            status: string
            grade: string | null
            class: {
              course_code: string
              title: string
              schedule_time: string
              instructor: { full_name: string } | null
              semester: { name: string; phase: string } | null
            } | null
          }>)
            .map((e) =>
              `  - ${e.class?.course_code ?? '?'} · ${e.class?.title ?? '?'} (semester ${e.class?.semester?.name ?? '?'}/${e.class?.semester?.phase ?? '?'}, instructor ${e.class?.instructor?.full_name ?? 'TBA'}, schedule ${e.class?.schedule_time ?? '?'}, status ${e.status}, grade ${e.grade ?? '—'})`,
            )
            .join('\n')
      }
    }

    const noLocal = !context.trim() && !instructorContext && !studentContext
    const system = `You are College0, an AI assistant for a graduate college program.
User role: ${role}. Profile status: ${profile?.status ?? 'unknown'}.
Answer using the CONTEXT when relevant. If CONTEXT is empty, say you are inferring without local documents and keep answers conservative.
CONTEXT:
${context || '(none)'}${instructorContext}${studentContext}`

    const answer = await chatComplete(openaiKey, [
      { role: 'system', content: system },
      { role: 'user', content: message },
    ])

    return corsJson({
      answer,
      used_rag: !noLocal,
      hallucination_warning: noLocal,
    })
  } catch (e) {
    return corsJson({ error: String(e) }, 500)
  }
})
