import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Profile = {
  id: string
  full_name: string
  role: string
  cumulative_gpa: number | null
}

type DirEn = {
  id: string
  student_id: string
  class_id: string
  status: string
  enrolled_at: string
}

export function VisitorDirectoryPage() {
  const [people, setPeople] = useState<Profile[]>([])
  const [links, setLinks] = useState<DirEn[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void supabase
      .from('profiles')
      .select('id, full_name, role, cumulative_gpa')
      .in('role', ['instructor', 'student'])
      .then(({ data, error }) => {
        if (error) setMsg(error.message)
        setPeople((data as Profile[]) ?? [])
      })
    void supabase.rpc('rpc_directory_enrollments').then(({ data, error }) => {
      if (error) setMsg(error.message)
      setLinks((data as DirEn[] | null) ?? [])
    })
  }, [])

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-white">Visitor directory</h1>
      <p className="text-sm text-zinc-500">
        Read-only roster of instructors and students, plus enrollment links without grades (RLS + RPC).
      </p>
      {msg && <p className="text-sm text-amber-300">{msg}</p>}
      <section>
        <h2 className="text-sm font-medium text-zinc-400">People</h2>
        <ul className="mt-2 space-y-1 text-sm text-zinc-300">
          {people.map((p) => (
            <li key={p.id}>
              <span className="text-indigo-300">{p.role}</span> · {p.full_name}
              {p.cumulative_gpa != null && <span className="ml-2 text-zinc-600">GPA {p.cumulative_gpa}</span>}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-medium text-zinc-400">Enrollments (no grades)</h2>
        <ul className="mt-2 max-h-64 overflow-auto font-mono text-[11px] text-zinc-500">
          {links.map((e) => (
            <li key={e.id}>
              student {e.student_id.slice(0, 8)}… → class {e.class_id.slice(0, 8)}… · {e.status}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
