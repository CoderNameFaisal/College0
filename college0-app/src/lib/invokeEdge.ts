import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import { supabase } from './supabase'

async function readHttpErrorBody(err: FunctionsHttpError): Promise<{ status?: number; detail: string }> {
  const res = err.context
  const status = typeof (res as Response).status === 'number' ? (res as Response).status : undefined
  let detail = err.message
  try {
    const raw = await (res as Response).clone().text()
    if (!raw.trim()) return { status, detail }
    try {
      const j = JSON.parse(raw) as { error?: unknown; message?: unknown }
      if (j.error != null) detail = String(j.error)
      else if (j.message != null) detail = String(j.message)
      else detail = raw.length > 800 ? `${raw.slice(0, 800)}…` : raw
    } catch {
      detail = raw.length > 800 ? `${raw.slice(0, 800)}…` : raw
    }
  } catch {
    /* keep err.message */
  }
  return { status, detail }
}

async function unwrapInvokeError(name: string, error: unknown): Promise<never> {
  if (error instanceof FunctionsHttpError) {
    const { status, detail } = await readHttpErrorBody(error)
    const prefix = status != null ? `[HTTP ${status}] ` : ''
    let hint = ''
    if (status === 500 && /GEMINI_API_KEY/i.test(detail)) {
      hint =
        ' Set GEMINI_API_KEY under Supabase Dashboard → Edge Functions → Secrets (local .env is not used by hosted functions), then redeploy if needed.'
    } else if (status === 401 && /invalid jwt/i.test(detail)) {
      hint =
        ' With `sb_publishable_...` keys, logged-out requests send a non-JWT Bearer token. Use the legacy anon JWT (eyJ…) from Dashboard → API as VITE_SUPABASE_ANON_KEY, or deploy this function with `[functions.<name>] verify_jwt = false` in supabase/config.toml (see repo for `ai-chat`).'
    }
    throw new Error(`${prefix}${detail}${hint}`)
  }
  if (error instanceof FunctionsRelayError) {
    throw new Error(`Edge relay error (${name}): ${error.message}`)
  }
  if (error instanceof FunctionsFetchError) {
    throw new Error(
      [
        `Could not reach Edge Function "${name}" (${error.message}).`,
        'Common causes: (1) the function is not deployed — run `npx supabase functions deploy ' +
          name +
          '` from college0-app after `supabase link`; (2) browser blocked the request (ad blocker / offline); (3) `VITE_SUPABASE_URL` has a typo — use `https://<project-ref>.supabase.co` with no trailing slash (the app strips one slash if present).',
      ].join(' '),
    )
  }
  throw new Error(error instanceof Error ? error.message : String(error))
}

export async function invokeEdgeSession<T = unknown>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (error) await unwrapInvokeError(name, error)
  return data as T
}
