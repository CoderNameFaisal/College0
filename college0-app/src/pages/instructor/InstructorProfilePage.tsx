import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import type { SemesterPhase } from '../../types/database'

type ClassHistoryRow = {
  id: string
  course_code: string
  title: string
  is_cancelled: boolean
  max_students: number
  avg_rating: number | null
  semester: { id: string; name: string; phase: SemesterPhase; created_at: string } | null
}

export function InstructorProfilePage() {
  const { user, profile } = useAuth()
  const [classes, setClasses] = useState<ClassHistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user) return
      const { data } = await supabase
        .from('classes')
        .select(
          'id,course_code,title,is_cancelled,max_students,avg_rating,semester:semesters(id,name,phase,created_at)',
        )
        .eq('instructor_id', user.id)
      if (!cancelled) {
        const list = (data as unknown as ClassHistoryRow[]) ?? []
        list.sort((a, b) =>
          (b.semester?.created_at ?? '').localeCompare(a.semester?.created_at ?? ''),
        )
        setClasses(list)
        setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  // Group classes by semester for the history view.
  const grouped = classes.reduce<Record<string, { name: string; phase: SemesterPhase; rows: ClassHistoryRow[] }>>(
    (acc, c) => {
      const key = c.semester?.id ?? 'unknown'
      if (!acc[key]) {
        acc[key] = {
          name: c.semester?.name ?? 'Unknown',
          phase: c.semester?.phase ?? 'closed',
          rows: [],
        }
      }
      acc[key].rows.push(c)
      return acc
    },
    {},
  )

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-white">My profile</h1>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-zinc-500">Name</dt>
          <dd className="text-white">{profile?.full_name ?? '—'}</dd>
          <dt className="text-zinc-500">Email</dt>
          <dd className="text-white">{user?.email ?? '—'}</dd>
          <dt className="text-zinc-500">Role</dt>
          <dd className="text-white">{profile?.role ?? '—'}</dd>
          <dt className="text-zinc-500">Status</dt>
          <dd className="text-white">{profile?.status ?? '—'}</dd>
          <dt className="text-zinc-500">Warnings on record</dt>
          <dd className="text-white">{profile?.warning_count ?? 0}</dd>
        </dl>
        <p className="mt-3 text-xs text-zinc-500">
          To change your name or password, go to{' '}
          <Link to="/account" className="text-indigo-300 hover:underline">
            Account settings
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Class history</h2>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : classes.length === 0 ? (
          <p className="text-sm text-zinc-500">No classes assigned to you.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([key, sem]) => (
              <div key={key} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="text-xs uppercase tracking-wider text-zinc-500">
                  {sem.name} <span className="text-zinc-600">({sem.phase})</span>
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {sem.rows.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-white">
                        {c.course_code} · {c.title}
                      </span>
                      <span className="text-xs text-zinc-500">
                        rating {c.avg_rating ?? '—'} · max {c.max_students}
                        {c.is_cancelled && <span className="ml-2 text-red-300">cancelled</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
