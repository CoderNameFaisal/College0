import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { invokeEdgeSession } from '../../lib/invokeEdge'

export function StudentStudyGroupsPage() {
  const [classes, setClasses] = useState<{ id: string; course_code: string }[]>([])
  const [classId, setClassId] = useState('')
  const [out, setOut] = useState<unknown>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void supabase.from('classes').select('id, course_code').then(({ data }) => {
      setClasses((data as { id: string; course_code: string }[]) ?? [])
      if (data?.[0]?.id) setClassId(data[0].id)
    })
  }, [])

  async function run() {
    setMsg(null)
    try {
      const r = await invokeEdgeSession('study-groups', { class_id: classId })
      setOut(r)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-white">AI study groups</h1>
      {msg && <p className="text-sm text-amber-300">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <select
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.course_code}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded bg-indigo-600 px-4 py-2 text-sm text-white"
          onClick={() => void run()}
        >
          Suggest partners (Edge + GPT-4o)
        </button>
      </div>
      {out != null ? (
        <pre className="overflow-auto rounded border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-300">
          {JSON.stringify(out, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}
