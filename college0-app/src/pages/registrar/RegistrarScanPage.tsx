import { useState } from 'react'
import { supabase } from '../../lib/supabase'

type ScanResult = { ok: boolean; cancelled: string[] }

export function RegistrarScanPage() {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setErr(null)
    setBusy(true)
    const { data, error } = await supabase.rpc('rpc_course_cancellation_scan')
    setBusy(false)
    if (error) {
      setErr(error.message)
      setResult(null)
      return
    }
    const raw = data as unknown
    if (raw && typeof raw === 'object' && 'ok' in raw && 'cancelled' in raw) {
      const c = (raw as { cancelled: unknown }).cancelled
      setResult({
        ok: Boolean((raw as { ok: unknown }).ok),
        cancelled: Array.isArray(c) ? (c as string[]) : [],
      })
    } else {
      setResult({ ok: true, cancelled: [] })
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-white">Course cancellation scan</h1>
      <p className="text-sm text-zinc-400">
        Marks classes with fewer than three enrolled students as cancelled and flags affected students for a special
        registration window (F08). Runs via database RPC (no Edge Function deploy required).
      </p>
      <button
        type="button"
        disabled={busy}
        className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        onClick={() => void run()}
      >
        {busy ? 'Running…' : 'Run scan'}
      </button>
      {err && <p className="text-red-400">{err}</p>}
      {result != null ? (
        <pre className="overflow-auto rounded border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-300">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}
