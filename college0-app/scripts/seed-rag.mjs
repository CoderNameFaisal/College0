/**
 * Populate public.document_embeddings with Gemini 768-dim vectors (matches pgvector + ai-chat).
 * Run from college0-app/: npm run seed:rag
 *
 * Requires in .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
 * Optional: GEMINI_EMBEDDING_MODEL (default gemini-embedding-001), GEMINI_EMBEDDING_DIM (default 768)
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

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const apiKey = process.env.GEMINI_API_KEY
const embedModel = (process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001').trim()
const dim = Math.floor(Number(process.env.GEMINI_EMBEDDING_DIM || '768')) || 768

if (!url || !serviceKey || !apiKey) {
  const miss = []
  if (!url) miss.push('SUPABASE_URL or VITE_SUPABASE_URL')
  if (!apiKey) miss.push('GEMINI_API_KEY')
  if (!serviceKey) miss.push('SUPABASE_SERVICE_ROLE_KEY')
  console.error('Missing in college0-app/.env:', miss.join(', '))
  if (!serviceKey) {
    console.error(
      '\nThe seed script must write to Postgres as an admin. Add one line (no VITE_ prefix — never expose this key to the browser):\n' +
        '  SUPABASE_SERVICE_ROLE_KEY=<copy from Supabase Dashboard → Project Settings → API → service_role secret>\n' +
        '\nThis is not the same as VITE_SUPABASE_ANON_KEY (anon/public key cannot insert into document_embeddings).',
    )
  }
  process.exit(1)
}

/** Short policy-style snippets so student/visitor questions can match via cosine search. */
const DOCS = [
  {
    content: `College0 registration: During the registration phase, students may enroll in at most 4 courses and at least 2 courses per semester. Waitlisted students are promoted automatically when a seat opens. Dropped courses free a seat immediately.`,
    metadata: { topic: 'registration', source: 'seed' },
  },
  {
    content: `College0 grading: Letter grades A through F are recorded on enrollments. Instructors enter grades only during the grading phase. Students may view their grades after they are posted.`,
    metadata: { topic: 'grading', source: 'seed' },
  },
  {
    content: `College0 graduation: Students must complete required program courses and maintain satisfactory academic standing. Graduation applications are submitted through the student portal when eligible.`,
    metadata: { topic: 'graduation', source: 'seed' },
  },
  {
    content: `College0 conduct: Taboo words in public reviews or messages may be flagged. The registrar may suspend accounts for repeated violations. Be professional in all course communications.`,
    metadata: { topic: 'conduct', source: 'seed' },
  },
  {
    content: `College0 waitlist: If a class is full, a student may join the waitlist. When an enrolled student drops, the next waitlisted student is enrolled if the semester is still in registration or running phase rules allow.`,
    metadata: { topic: 'waitlist', source: 'seed' },
  },
  {
    content: `College0 course cancellation: Courses with very low enrollment may be cancelled by the registrar during the running phase; affected students receive warnings or notices per policy.`,
    metadata: { topic: 'cancellation', source: 'seed' },
  },
]

async function geminiEmbed(text) {
  const u = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${embedModel}:embedContent`,
  )
  u.searchParams.set('key', apiKey)
  const res = await fetch(u.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${embedModel}`,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: dim,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`embedContent ${res.status}: ${errText}`)
  }
  const json = await res.json()
  const values = json.embedding?.values
  if (!Array.isArray(values) || values.length !== dim) {
    throw new Error(`Expected ${dim}-dim embedding, got ${values?.length ?? 0}`)
  }
  return values
}

const supabase = createClient(url, serviceKey)

const { error: delErr } = await supabase
  .from('document_embeddings')
  .delete()
  .gte('created_at', '1970-01-01T00:00:00Z')
if (delErr) {
  console.error('Clear document_embeddings:', delErr.message)
  process.exit(1)
}

for (const doc of DOCS) {
  const embedding = await geminiEmbed(doc.content)
  const { error } = await supabase.from('document_embeddings').insert({
    content: doc.content,
    metadata: doc.metadata,
    embedding,
  })
  if (error) {
    console.error('Insert failed:', error.message)
    process.exit(1)
  }
  console.log('Inserted:', doc.metadata.topic)
}

console.log(`Done. ${DOCS.length} rows in document_embeddings (dim=${dim}, model=${embedModel}).`)
