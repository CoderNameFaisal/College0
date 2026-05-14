import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsJson, handleCors, roleFromProfile } from '../_shared/cors.ts'
import { geminiEmbedText, geminiGenerateText } from '../_shared/gemini.ts'

Deno.serve(async (req) => {
  const opt = handleCors(req)
  if (opt) return opt

  try {
    const authHeader = req.headers.get('Authorization')
    // Authorization is required so the gateway routes the call, but we accept
    // unauthenticated (visitor) calls that pass only the anon key as bearer.
    if (!authHeader) return corsJson({ error: 'Missing authorization' }, 401)

    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) return corsJson({ error: 'GEMINI_API_KEY not configured' }, 500)

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
    const body = (await req.json()) as Record<string, unknown>
    const message = body.message
    const classIdRaw = body.class_id
    if (!message || typeof message !== 'string') {
      return corsJson({ error: 'message required' }, 400)
    }

    const vec = await geminiEmbedText({ apiKey: geminiKey, text: message, taskType: 'RETRIEVAL_QUERY' })

    const { data: chunks, error: matchErr } = await admin.rpc('match_documents', {
      query_embedding: vec,
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
          'status,grade,class:classes(course_code,title,schedule_time,location_label,location_lat,location_lng,instructor:profiles!classes_instructor_id_fkey(full_name),semester:semesters(name,phase))',
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
              location_label: string | null
              location_lat: number | null
              location_lng: number | null
              instructor: { full_name: string } | null
              semester: { name: string; phase: string } | null
            } | null
          }>)
            .map((e) => {
              const loc =
                e.class?.location_lat != null && e.class?.location_lng != null
                  ? `, location lat/lng ${e.class.location_lat},${e.class.location_lng} (${e.class.location_label ?? 'no label'})`
                  : ''
              return `  - ${e.class?.course_code ?? '?'} · ${e.class?.title ?? '?'} (semester ${e.class?.semester?.name ?? '?'}/${e.class?.semester?.phase ?? '?'}, instructor ${e.class?.instructor?.full_name ?? 'TBA'}, schedule ${e.class?.schedule_time ?? '?'}${loc}, status ${e.status}, grade ${e.grade ?? '—'})`
            })
            .join('\n')
      }
    }

    /** Optional single-class focus (Gemini context); access-checked per role. */
    let focusedClassContext = ''
    if (
      user &&
      classIdRaw &&
      typeof classIdRaw === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classIdRaw)
    ) {
      let allowClass = false
      if (role === 'registrar') allowClass = true
      else if (role === 'instructor') {
        const { data: own } = await userClient
          .from('classes')
          .select('id')
          .eq('id', classIdRaw)
          .eq('instructor_id', user.id)
          .maybeSingle()
        allowClass = !!own
      } else if (role === 'student') {
        const { data: en } = await userClient
          .from('enrollments')
          .select('id')
          .eq('student_id', user.id)
          .eq('class_id', classIdRaw)
          .neq('status', 'dropped')
          .maybeSingle()
        allowClass = !!en
      }

      if (allowClass) {
        const { data: crow } = await userClient
          .from('classes')
          .select(
            'course_code,title,schedule_time,location_label,location_lat,location_lng,semester:semesters(name,phase)',
          )
          .eq('id', classIdRaw)
          .maybeSingle()
        const row = crow as {
          course_code: string
          title: string
          schedule_time: string
          location_label: string | null
          location_lat: number | null
          location_lng: number | null
          semester: { name: string; phase: string } | null
        } | null
        if (row) {
          const locLine =
            row.location_lat != null && row.location_lng != null
              ? ` Map pin (WGS84): lat ${row.location_lat}, lng ${row.location_lng}. Human label: ${row.location_label ?? '(none)'}.`
              : ' No map coordinates on file for this section.'
          focusedClassContext = `\n\nFOCUSED CLASS:\n${row.course_code} — ${row.title}\nSchedule: ${row.schedule_time}\nSemester: ${row.semester?.name ?? '?'} (${row.semester?.phase ?? '?'}).${locLine}`
        }
      }
    }

    const noLocal =
      !context.trim() && !instructorContext && !studentContext && !focusedClassContext.trim()
    const system = `You are College0, an AI assistant for a graduate college program.
User role: ${role}. Profile status: ${profile?.status ?? 'unknown'}.
Answer using the CONTEXT when relevant. If CONTEXT is empty, say you are inferring without local documents and keep answers conservative.
CONTEXT:
${context || '(none)'}${instructorContext}${studentContext}${focusedClassContext}`

    const answer = await geminiGenerateText({
      apiKey: geminiKey,
      systemInstruction: system,
      userMessage: message,
      temperature: 0.4,
    })

    return corsJson({
      answer,
      used_rag: !noLocal,
      hallucination_warning: noLocal,
    })
  } catch (e) {
    return corsJson({ error: String(e) }, 500)
  }
})
