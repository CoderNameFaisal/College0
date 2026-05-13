import { useState } from 'react'
import { invokeEdgeSession } from '../../lib/invokeEdge'

type AIResponse = {
  answer: string
  used_rag: boolean
  hallucination_warning: boolean
}

export function StudentAIPage() {
  const [message, setMessage] = useState('')
  const [response, setResponse] = useState<AIResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function send() {
    if (!message.trim()) return
    setLoading(true)
    setErr(null)
    setResponse(null)
    try {
      const r = await invokeEdgeSession<AIResponse>('ai-chat', { message: message.trim() })
      setResponse(r)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">AI assistant</h1>
        <p className="text-sm text-zinc-500">
          Ask about the college system or your current courses. Answers come from the local
          knowledge base first; if nothing matches, the LLM answers with a hallucination warning.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g., What time is my CS101 class? What are the registration rules? Who teaches my MATH101?"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
        />
        <div className="flex justify-end">
          <button
            type="button"
            disabled={loading || !message.trim()}
            onClick={() => void send()}
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {loading ? 'Thinking…' : 'Ask'}
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">{err}</div>
      )}

      {response && (
        <div className="space-y-2">
          {response.hallucination_warning && (
            <div className="rounded border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">
              ⚠ No matching documents were found in the local knowledge base — this answer is
              LLM-only and may hallucinate.
            </div>
          )}
          {!response.hallucination_warning && response.used_rag && (
            <div className="rounded border border-emerald-700/40 bg-emerald-950/30 p-3 text-xs text-emerald-300">
              ✓ Answer grounded in local documents (RAG).
            </div>
          )}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-200 whitespace-pre-wrap">
            {response.answer}
          </div>
        </div>
      )}
    </div>
  )
}
