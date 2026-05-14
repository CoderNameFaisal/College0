import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { invokeEdgeSession } from '../../lib/invokeEdge'

type AIResponse = {
  answer: string
  used_rag: boolean
  used_app_context?: boolean
  hallucination_warning: boolean
}

export function InstructorAIPage() {
  const [searchParams] = useSearchParams()
  const focusClassId = searchParams.get('class_id')
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
      const body: Record<string, unknown> = { message: message.trim() }
      if (focusClassId) body.class_id = focusClassId
      const r = await invokeEdgeSession<AIResponse>('ai-chat', body)
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
          Ask about the college system, your classes, or your students. Answers come from the local
          knowledge base first; if nothing matches, the LLM answers with a hallucination warning.
          {focusClassId && (
            <span className="mt-1 block text-xs text-indigo-300">
              Focusing one section (class_id in URL) — you must teach that section for extra context.
            </span>
          )}
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g., Which of my students has the highest GPA? What are the registration rules?"
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
              ⚠ No policy documents and no roster context — LLM-only; may hallucinate. Run{' '}
              <code className="text-amber-100">npm run seed:rag</code> if you need the policy knowledge
              base (README).
            </div>
          )}
          {response.used_rag && (
            <div className="rounded border border-emerald-700/40 bg-emerald-950/30 p-3 text-xs text-emerald-300">
              ✓ Answer grounded in local policy documents (vector search).
            </div>
          )}
          {!response.used_rag && response.used_app_context && (
            <div className="rounded border border-sky-800/60 bg-sky-950/25 p-3 text-xs text-sky-200">
              ℹ No policy documents matched, but your class rosters were sent to the model — answers
              about your students should still be reliable.
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
