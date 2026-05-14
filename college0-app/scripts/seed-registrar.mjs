/**
 * Create the first registrar Auth user + profile (handle_new_user trigger sets role from metadata).
 * Run from college0-app/: npm run seed:registrar
 *
 * Requires in .env: SUPABASE_SERVICE_ROLE_KEY, and VITE_SUPABASE_URL or SUPABASE_URL
 * Optional: REGISTRAR_EMAIL, REGISTRAR_PASSWORD, REGISTRAR_FULL_NAME
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env')

function loadDotEnv(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim().replace(/^\uFEFF/, '')
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    const cur = process.env[key]
    if (cur === undefined || cur === '') process.env[key] = val
  }
}

loadDotEnv(envPath)

const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url) {
  console.error('Missing SUPABASE_URL or VITE_SUPABASE_URL in .env')
  process.exit(1)
}
if (!serviceKey) {
  console.error(
    'Missing SUPABASE_SERVICE_ROLE_KEY in .env (Dashboard → Project Settings → API → service_role).',
  )
  process.exit(1)
}

const email = (process.env.REGISTRAR_EMAIL || 'registrar@college0.local').trim().toLowerCase()
const password = process.env.REGISTRAR_PASSWORD || 'RegistrarTemp!2026Aa'
const fullName = (process.env.REGISTRAR_FULL_NAME || 'Registrar').trim() || 'Registrar'

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName, role: 'registrar' },
})

if (error) {
  if (/already|registered|exists/i.test(error.message)) {
    console.error(`Auth user already exists for ${email}.`)
    console.error(
      'Delete them in Supabase Dashboard → Authentication → Users, then run npm run seed:registrar again,',
    )
    console.error('or sign in with that account if it is already a registrar.')
    process.exit(1)
  }
  console.error(error.message)
  process.exit(1)
}

const u = data.user
console.log('Registrar created.')
console.log('  Email:', email)
console.log('  User id:', u?.id)
console.log('  Password (change after first login):', password)
console.log('  Profile role is set by trigger from user_metadata.role=registrar.')
