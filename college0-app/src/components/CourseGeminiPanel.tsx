import { useState } from 'react'
import { invokeEdgeSession } from '../lib/invokeEdge'

type AIResponse = {
  answer: string
  used_rag: boolean
  used_app_context?: boolean
  hallucination_warning: boolean
}

type Props = {
  classId: string
  courseCode: string
  title: string
}

/** Per-course Gemini chat (same Edge `ai-chat` + optional `class_id` context). */
export function CourseGeminiPanel({ classId, courseCode, title }: Props) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState<AIResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send() {
    if (!message.trim()) return
    setBusy(true)
    setErr(null)
    setReply(null)
    try {
      const r = await invokeEdgeSession<AIResponse>('ai-chat', {
        message: message.trim(),
        class_id: classId,
      })
      setReply(r)
      setMessage('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 rounded border border-indigo-900/50 bg-indigo-950/20 p-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs font-medium text-indigo-300 hover:text-indigo-200"
      >
        {open ? '▼' : '▶'} Gemini · {courseCode}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-zinc-500">
            Ask about <span className="text-zinc-300">{title}</span> (Gemini + your program context).
          </p>
          <textarea
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g., Summarize what I should prepare for this course."
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => void send()}
              className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? '…' : 'Send'}
            </button>
          </div>
          {err && <p className="text-xs text-amber-300">{err}</p>}
          {reply && (
            <div className="rounded border border-zinc-800 bg-zinc-950/80 p-2 text-xs text-zinc-200">
              <p className="whitespace-pre-wrap">{reply.answer}</p>
              {reply.hallucination_warning && (
                <p className="mt-1 text-[10px] text-amber-400/90">
                  No policy docs or section context — verify facts. Run <code>npm run seed:rag</code> for
                  RAG snippets.
                </p>
              )}
              {!reply.hallucination_warning && !reply.used_rag && reply.used_app_context && (
                <p className="mt-1 text-[10px] text-sky-400/90">
                  This section&apos;s details were sent; no policy doc match for your exact wording.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
