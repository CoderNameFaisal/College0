import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { ProfileStatus } from '../../types/database'

type StudentRow = {
  id: string
  full_name: string
  student_id: string | null
  status: ProfileStatus
  warning_count: number
  cumulative_gpa: number | null
  honor_roll_count: number
}

type Filter =
  | 'all'
  | 'active'
  | 'suspended'
  | 'terminated'
  | 'graduated'
  | 'honor-roll'
  | 'needs-interview'
  | 'at-risk'

const filterLabels: Record<Filter, string> = {
  all: 'All',
  active: 'Active',
  suspended: 'Suspended',
  terminated: 'Terminated',
  graduated: 'Graduated',
  'honor-roll': 'Honor roll',
  'needs-interview': 'Needs interview',
  'at-risk': 'At risk',
}

export function RegistrarStudentsPage() {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)

  const filter = (params.get('filter') as Filter | null) ?? 'all'

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('id,full_name,student_id,status,warning_count,cumulative_gpa,honor_roll_count')
        .eq('role', 'student')
        .order('full_name')
      if (!cancelled) {
        setRows((data as StudentRow[]) ?? [])
        setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      switch (filter) {
        case 'all':
          return true
        case 'honor-roll':
          return r.cumulative_gpa !== null && r.cumulative_gpa >= 3.5 && r.honor_roll_count > 1
        case 'needs-interview':
          return (
            r.status === 'active' &&
            r.cumulative_gpa !== null &&
            r.cumulative_gpa >= 2.0 &&
            r.cumulative_gpa < 2.25
          )
        case 'at-risk':
          return r.cumulative_gpa !== null && r.cumulative_gpa < 2.25
        default:
          return r.status === filter
      }
    })
  }, [rows, filter])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Students</h1>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(filterLabels) as Filter[]).map((f) => (
          <button
            type="button"
            key={f}
            onClick={() => {
              if (f === 'all') setParams({})
              else setParams({ filter: f })
            }}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === f
                ? 'border-indigo-500 bg-indigo-600 text-white'
                : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {filterLabels[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Student ID</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">GPA</th>
                <th className="px-4 py-2">Warnings</th>
                <th className="px-4 py-2">Flags</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-zinc-500">
                    No students match this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const flags: string[] = []
                  if (r.cumulative_gpa !== null && r.cumulative_gpa >= 3.5 && r.honor_roll_count > 1)
                    flags.push('honor roll')
                  if (
                    r.status === 'active' &&
                    r.cumulative_gpa !== null &&
                    r.cumulative_gpa >= 2.0 &&
                    r.cumulative_gpa < 2.25
                  )
                    flags.push('needs interview')
                  if (r.cumulative_gpa !== null && r.cumulative_gpa < 2.0) flags.push('at risk')
                  if (r.warning_count >= 2 && r.status === 'active') flags.push('near suspension')
                  return (
                    <tr key={r.id} className="border-t border-zinc-800 hover:bg-zinc-900/40">
                      <td className="px-4 py-2 text-white">{r.full_name}</td>
                      <td className="px-4 py-2 text-zinc-400">{r.student_id ?? '—'}</td>
                      <td className="px-4 py-2">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-2 text-zinc-300">{r.cumulative_gpa ?? '—'}</td>
                      <td className="px-4 py-2 text-zinc-300">{r.warning_count}</td>
                      <td className="px-4 py-2 text-xs text-amber-300">
                        {flags.length === 0 ? '—' : flags.join(', ')}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          to={`/registrar/students/${r.id}`}
                          className="text-xs text-indigo-300 hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ProfileStatus }) {
  const tone: Record<ProfileStatus, string> = {
    active: 'bg-emerald-900/40 text-emerald-300',
    suspended: 'bg-amber-900/40 text-amber-300',
    terminated: 'bg-red-900/40 text-red-300',
    graduated: 'bg-indigo-900/40 text-indigo-300',
  }
  return <span className={`rounded px-2 py-0.5 text-xs ${tone[status]}`}>{status}</span>
}
