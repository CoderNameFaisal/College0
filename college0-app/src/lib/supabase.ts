import { createClient } from '@supabase/supabase-js'

const url = String(import.meta.env.VITE_SUPABASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '')
const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

if (!url || !anon) {
  const help = [
    'College0: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing at runtime.',
    '',
    'Fix:',
    '1. File: college0-app/.env next to vite.config.ts (vite is now pinned to load .env from that folder).',
    '2. Two lines (save the file — if the editor shows only 1 line, the anon line may be unsaved):',
    '   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co',
    '   VITE_SUPABASE_ANON_KEY=eyJ... (legacy anon JWT from API settings; required for some Edge Functions unless verify_jwt is disabled per function)',
    '3. Verify in terminal: cd college0-app && grep "^VITE_" .env',
    '4. Restart dev: Ctrl+C, then npm run dev',
  ].join('\n')
  console.error(help)
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. See console for steps.',
  )
}

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
