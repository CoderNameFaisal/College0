import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type ClassRow = {
  id: string
  course_code: string
  title: string
  semester_id: string
  instructor_id: string | null
  schedule_time: string
  max_students: number
  is_cancelled: boolean
}

type Profile = { id: string; full_name: string; role: string }

export function RegistrarClassesPage() {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [semesters, setSemesters] = useState<{ id: string; name: string }[]>([])
  const [instructors, setInstructors] = useState<Profile[]>([])
  const [semesterId, setSemesterId] = useState('')
  const [code, setCode] = useState('CS501')
  const [title, setTitle] = useState('Distributed Systems')
  const [instructorId, setInstructorId] = useState('')
  const [maxStudents, setMaxStudents] = useState(10)
  const [start, setStart] = useState('2026-09-01T14:00')
  const [end, setEnd] = useState('2026-09-01T15:30')
  const [msg, setMsg] = useState<string | null>(null)

  function toTsRange(a: string, b: string) {
    const s = new Date(a).toISOString().replace('T', ' ').replace('Z', '+00')
    const e = new Date(b).toISOString().replace('T', ' ').replace('Z', '+00')
    return `[${s},${e})`
  }

  async function load() {
    const [{ data: c }, { data: s }, { data: ins }] = await Promise.all([
      supabase.from('classes').select('*').order('course_code'),
      supabase.from('semesters').select('id, name').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, role').eq('role', 'instructor'),
    ])
    setClasses((c as ClassRow[]) ?? [])
    setSemesters((s as { id: string; name: string }[]) ?? [])
    setInstructors((ins as Profile[]) ?? [])
    if (s?.[0]?.id && !semesterId) setSemesterId(s[0].id)
  }

  useEffect(() => {
    void load()
  }, [])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (!semesterId) {
      setMsg('Create a semester first.')
      return
    }
    const { error } = await supabase.from('classes').insert({
      semester_id: semesterId,
      course_code: code,
      title,
      instructor_id: instructorId || null,
      schedule_time: toTsRange(start, end),
      max_students: maxStudents,
    })
    if (error) setMsg(error.message)
    else void load()
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-white">Classes</h1>
      {msg && <p className="text-sm text-amber-300">{msg}</p>}
      <form onSubmit={onCreate} className="grid gap-3 rounded-xl border border-zinc-800 p-4 md:grid-cols-2">
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs text-zinc-500">Semester</span>
          <select
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            value={semesterId}
            onChange={(e) => setSemesterId(e.target.value)}
          >
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Course code</span>
          <input
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Title</span>
          <input
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs text-zinc-500">Instructor</span>
          <select
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            value={instructorId}
            onChange={(e) => setInstructorId(e.target.value)}
          >
            <option value="">— Unassigned —</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Schedule start</span>
          <input
            type="datetime-local"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Schedule end</span>
          <input
            type="datetime-local"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Max students</span>
          <input
            type="number"
            min={1}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            value={maxStudents}
            onChange={(e) => setMaxStudents(Number(e.target.value))}
          />
        </label>
        <div className="flex items-end">
          <button type="submit" className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500">
            Create class
          </button>
        </div>
      </form>
      <ul className="space-y-2">
        {classes.map((c) => (
          <li key={c.id} className="rounded border border-zinc-800 px-3 py-2 text-sm text-zinc-300">
            <span className="font-mono text-indigo-300">{c.course_code}</span> · {c.title}
            {c.is_cancelled && <span className="ml-2 text-red-400">cancelled</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
