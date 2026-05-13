import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { invokeEdgeSession } from '../../lib/invokeEdge'
import type { SemesterPhase } from '../../types/database'

type Semester = {
  id: string
  name: string
  phase: SemesterPhase
  quota: number
}

const phases: SemesterPhase[] = ['setup', 'registration', 'running', 'grading', 'closed']

export function RegistrarSemestersPage() {
  const [rows, setRows] = useState<Semester[]>([])
  const [name, setName] = useState('Fall 2026')
  const [quota, setQuota] = useState(20)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.from('semesters').select('*').order('created_at', { ascending: false })
    setRows((data as Semester[]) ?? [])
  }

  useEffect(() => {
    void load()
  }, [])

  async function createSemester(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    const { error } = await supabase.from('semesters').insert({ name, quota })
    if (error) setMsg(error.message)
    else {
      setName('Fall 2026')
      void load()
    }
  }

  async function advance(id: string, current: SemesterPhase) {
    setMsg(null)
    const idx = phases.indexOf(current)
    if (idx < 0 || idx >= phases.length - 1) return
    const next = phases[idx + 1]
    try {
      await invokeEdgeSession('transition-phase', { semester_id: id, next_phase: next })
      void load()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-white">Semesters</h1>
      {msg && <p className="text-sm text-amber-300">{msg}</p>}
      <form onSubmit={createSemester} className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 p-4">
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Name</span>
          <input
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Quota</span>
          <input
            type="number"
            min={1}
            className="w-24 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            value={quota}
            onChange={(e) => setQuota(Number(e.target.value))}
          />
        </label>
        <button type="submit" className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500">
          Create semester
        </button>
      </form>
      <ul className="space-y-3">
        {rows.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
          >
            <div>
              <div className="font-medium text-white">{s.name}</div>
              <div className="text-xs text-zinc-500">
                Phase: <span className="text-indigo-300">{s.phase}</span> · quota {s.quota}
              </div>
            </div>
            {s.phase !== 'closed' && (
              <button
                type="button"
                className="rounded border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
                onClick={() => void advance(s.id, s.phase)}
              >
                Advance phase
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
