import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export function RegistrarTabooPage() {
  const [words, setWords] = useState<{ id: string; word: string }[]>([])
  const [w, setW] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.from('taboo_words').select('id, word').order('word')
    setWords((data as { id: string; word: string }[]) ?? [])
  }

  useEffect(() => {
    void load()
  }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    const { error } = await supabase.from('taboo_words').insert({ word: w.trim().toLowerCase() })
    if (error) setMsg(error.message)
    else {
      setW('')
      void load()
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Taboo words</h1>
      {msg && <p className="text-sm text-amber-300">{msg}</p>}
      <form onSubmit={add} className="flex gap-2">
        <input
          className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
          placeholder="word"
          value={w}
          onChange={(e) => setW(e.target.value)}
        />
        <button type="submit" className="rounded bg-indigo-600 px-4 py-2 text-sm text-white">
          Add
        </button>
      </form>
      <ul className="flex flex-wrap gap-2">
        {words.map((x) => (
          <li key={x.id} className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
            {x.word}
          </li>
        ))}
      </ul>
    </div>
  )
}
