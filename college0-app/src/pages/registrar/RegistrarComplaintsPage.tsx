import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ComplaintStatus, UserRole } from '../../types/database'

type Complaint = {
  id: string
  description: string
  status: ComplaintStatus
  resolution: string | null
  created_at: string
  filer: { id: string; full_name: string; role: UserRole } | null
  target: { id: string; full_name: string; role: UserRole } | null
}

export function RegistrarComplaintsPage() {
  const [rows, setRows] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [showResolved, setShowResolved] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [forms, setForms] = useState<Record<string, { target: string; reason: string; resolution: string }>>(
    {},
  )

  const load = useCallback(async () => {
    const q = supabase
      .from('complaints')
      .select(
        'id,description,status,resolution,created_at,filer:profiles!complaints_filed_by_fkey(id,full_name,role),target:profiles!complaints_against_fkey(id,full_name,role)',
      )
      .order('created_at', { ascending: false })
    const { data, error } = showResolved ? await q : await q.eq('status', 'open')
    if (error) setMsg(error.message)
    else setRows((data as unknown as Complaint[]) ?? [])
    setLoading(false)
  }, [showResolved])

  useEffect(() => {
    void load()
  }, [load])

  function updateForm(id: string, patch: Partial<{ target: string; reason: string; resolution: string }>) {
    setForms((f) => ({
      ...f,
      [id]: { ...(f[id] ?? { target: '', reason: '', resolution: '' }), ...patch },
    }))
  }

  async function resolve(c: Complaint) {
    const form = forms[c.id] ?? { target: '', reason: '', resolution: '' }
    setMsg(null)
    const instructorFiled = c.filer?.role === 'instructor'
    if (instructorFiled && !form.target) {
      setMsg('Instructor complaints must result in a warning — pick a target.')
      return
    }
    if (form.target && !form.reason.trim()) {
      setMsg('Reason is required when issuing a warning.')
      return
    }

    const { error } = await supabase.rpc('rpc_resolve_complaint', {
      p_complaint_id: c.id,
      p_warn_target_id: form.target || null,
      p_reason: form.reason.trim() || null,
      p_resolution: form.resolution.trim() || null,
    })
    if (error) setMsg(error.message)
    else {
      setForms((f) => ({ ...f, [c.id]: { target: '', reason: '', resolution: '' } }))
      await load()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Complaints</h1>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Show resolved
        </label>
      </div>

      {msg && <p className="text-sm text-amber-300">{msg}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No complaints to show.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((c) => {
            const instructorFiled = c.filer?.role === 'instructor'
            const form = forms[c.id] ?? { target: '', reason: '', resolution: '' }
            return (
              <li key={c.id} className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm">
                    <span className="text-white">{c.filer?.full_name ?? 'Unknown'}</span>
                    <span className="text-zinc-500"> ({c.filer?.role ?? '?'}) </span>
                    <span className="text-zinc-500">vs</span>{' '}
                    <span className="text-white">{c.target?.full_name ?? 'Unknown'}</span>
                    <span className="text-zinc-500"> ({c.target?.role ?? '?'})</span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    {new Date(c.created_at).toLocaleString()} ·{' '}
                    <span className={c.status === 'open' ? 'text-amber-300' : 'text-emerald-300'}>
                      {c.status}
                    </span>
                  </div>
                </div>
                <p className="rounded bg-zinc-950/60 p-3 text-sm text-zinc-200">{c.description}</p>

                {c.status === 'resolved' && c.resolution && (
                  <p className="text-xs text-zinc-500">Resolution: {c.resolution}</p>
                )}

                {c.status === 'open' && (
                  <div className="space-y-2 border-t border-zinc-800 pt-3">
                    {instructorFiled && (
                      <p className="text-xs text-amber-300">
                        Instructor-filed: a warning to either party is required to resolve.
                      </p>
                    )}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr]">
                      <select
                        className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                        value={form.target}
                        onChange={(e) => updateForm(c.id, { target: e.target.value })}
                      >
                        <option value="">No warning</option>
                        {c.target && (
                          <option value={c.target.id}>
                            Warn the accused ({c.target.full_name})
                          </option>
                        )}
                        {c.filer && (
                          <option value={c.filer.id}>
                            Warn the complainant ({c.filer.full_name})
                          </option>
                        )}
                      </select>
                      <input
                        className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                        placeholder="Reason for warning (required if warning)"
                        value={form.reason}
                        onChange={(e) => updateForm(c.id, { reason: e.target.value })}
                      />
                    </div>
                    <input
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                      placeholder="Resolution notes (optional)"
                      value={form.resolution}
                      onChange={(e) => updateForm(c.id, { resolution: e.target.value })}
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void resolve(c)}
                        className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
