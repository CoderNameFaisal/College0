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

    const { data: profile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'registrar') {
      return corsJson({ error: 'Only registrars may run cancellation scan' }, 403)
    }

    const { data: classes } = await admin
      .from('classes')
      .select('id, course_code, title, semester_id')
      .eq('is_cancelled', false)

    const cancelled: string[] = []
    for (const c of classes ?? []) {
      const { count } = await admin
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('class_id', c.id)
        .eq('status', 'enrolled')
      if ((count ?? 0) < 3) {
        await admin.from('classes').update({ is_cancelled: true }).eq('id', c.id)
        cancelled.push(c.course_code)
        const { data: affected } = await admin
          .from('enrollments')
          .select('student_id')
          .eq('class_id', c.id)
          .in('status', ['enrolled', 'waitlisted'])
        const ids = [...new Set((affected ?? []).map((e: { student_id: string }) => e.student_id))]
        for (const sid of ids) {
          await admin
            .from('profiles')
            .update({ special_registration_eligible: true })
            .eq('id', sid)
        }
      }
    }

    return corsJson({ ok: true, cancelled })
  } catch (e) {
    return corsJson({ error: String(e) }, 500)
  }
})
