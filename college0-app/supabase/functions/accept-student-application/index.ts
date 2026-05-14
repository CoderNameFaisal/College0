import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
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
      return corsJson({ error: 'Only registrars may accept applications' }, 403)
    }

    const body = await req.json()
    const application_id = body.application_id as string | undefined
    const justification =
      typeof body.justification === 'string' ? (body.justification as string) : null
    const fullNameOverride =
      typeof body.full_name === 'string' ? (body.full_name as string).trim() : ''
    if (!application_id) return corsJson({ error: 'application_id required' }, 400)

    const admin = createClient(supabaseUrl, serviceKey)

    const { data: app, error: appErr } = await admin
      .from('applications')
      .select('id,applicant_email,applicant_name,role_requested,prior_gpa,status')
      .eq('id', application_id)
      .maybeSingle()
    if (appErr || !app) return corsJson({ error: 'Application not found' }, 404)
    if (app.status !== 'pending') return corsJson({ error: 'Application already decided' }, 400)

    if (app.role_requested === 'instructor') {
      return await acceptInstructorApplication(admin, app, user.id, fullNameOverride)
    }

    if (app.role_requested !== 'student') {
      return corsJson({ error: 'Unsupported application type' }, 400)
    }

    const { data: sem } = await admin
      .from('semesters')
      .select('id,quota,phase')
      .eq('phase', 'registration')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sem) {
      const { count: activeStudents } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'student')
        .eq('status', 'active')
      const mustAccept =
        app.prior_gpa !== null && app.prior_gpa > 3.0 && (activeStudents ?? 0) < sem.quota
      if (!mustAccept && !justification?.trim()) {
        return corsJson(
          {
            error:
              'Justification required to accept an applicant who does not meet the auto-accept rule (GPA > 3.0 and quota available)',
          },
          400,
        )
      }
    }

    const studentId = `S-${Math.floor(100000 + Math.random() * 900000)}`
    const tempPassword = generateTempPassword()
    const fullName =
      fullNameOverride ||
      (app.applicant_name as string | null) ||
      app.applicant_email.split('@')[0]

    const { data: createRes, error: createErr } = await admin.auth.admin.createUser({
      email: app.applicant_email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'student' },
    })
    if (createErr || !createRes.user) {
      return corsJson(
        { error: `Failed to create user: ${createErr?.message ?? 'unknown'}` },
        500,
      )
    }

    await admin.from('profiles').update({ student_id: studentId }).eq('id', createRes.user.id)

    await admin
      .from('applications')
      .update({
        status: 'accepted',
        rejection_reason: justification,
        reviewed_by: user.id,
      })
      .eq('id', application_id)

    return corsJson({
      ok: true,
      student_id: studentId,
      temp_password: tempPassword,
      user_id: createRes.user.id,
      email: app.applicant_email,
    })
  } catch (e) {
    return corsJson({ error: String(e) }, 500)
  }
})

async function acceptInstructorApplication(
  admin: SupabaseClient,
  app: {
    id: string
    applicant_email: string
    applicant_name: string | null
    role_requested: string
    prior_gpa: number | null
    status: string
  },
  registrarId: string,
  fullNameOverride: string,
) {
  const tempPassword = generateTempPassword()
  const fullName =
    fullNameOverride ||
    (app.applicant_name as string | null)?.trim() ||
    app.applicant_email.split('@')[0]

  const { data: createRes, error: createErr } = await admin.auth.admin.createUser({
    email: app.applicant_email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: 'instructor' },
  })
  if (createErr || !createRes.user) {
    const msg = createErr?.message ?? 'unknown'
    if (/already|registered|exists/i.test(msg)) {
      return corsJson(
        {
          error:
            `Auth user may already exist for ${app.applicant_email}. Remove the duplicate in Dashboard → Authentication, or have them sign in.`,
        },
        409,
      )
    }
    return corsJson({ error: `Failed to create user: ${msg}` }, 500)
  }

  await admin
    .from('applications')
    .update({
      status: 'accepted',
      rejection_reason: null,
      reviewed_by: registrarId,
    })
    .eq('id', app.id)

  return corsJson({
    ok: true,
    user_id: createRes.user.id,
    email: app.applicant_email,
    temp_password: tempPassword,
    full_name: fullName,
  })
}

function generateTempPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let pw = ''
  for (let i = 0; i < 10; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)]
  }
  return pw + '!1A'
}
