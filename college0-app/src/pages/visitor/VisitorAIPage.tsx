import { useState } from 'react'
import { invokeEdgeSession } from '../../lib/invokeEdge'

type AIResponse = {
  answer: string
  used_rag: boolean
  used_app_context?: boolean
  hallucination_warning: boolean
}

export function VisitorAIPage() {
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Ask the AI</h1>
        <p className="text-sm text-zinc-400">
          Ask about the program, admission requirements, available classes, or the application
          process. Answers come from the local knowledge base first; if nothing matches, the LLM
          answers with a hallucination warning.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g., How do I apply? What courses are offered? What GPA do I need?"
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
        <div className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">
          {err}
        </div>
      )}

      {response && (
        <div className="space-y-2">
          {response.hallucination_warning && (
            <div className="rounded border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">
              ⚠ No policy documents matched — this answer is LLM-only and may hallucinate. Deployers
              can run <code className="text-amber-100">npm run seed:rag</code> (see README) to load the
              knowledge base.
            </div>
          )}
          {response.used_rag && (
            <div className="rounded border border-emerald-700/40 bg-emerald-950/30 p-3 text-xs text-emerald-300">
              ✓ Answer grounded in local policy documents (vector search).
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
