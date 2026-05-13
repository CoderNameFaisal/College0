import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

type Row = {
  stat_type: string
  rank: number
  label: string
  value_num: number | null
  value_text: string | null
}

export function PublicDashboard() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void supabase
      .from('v_public_dashboard_stats')
      .select('*')
      .then(({ data, error }) => {
        if (error) setErr(error.message)
        else setRows((data as Row[]) ?? [])
      })
  }, [])

  const topClass = rows.filter((r) => r.stat_type === 'top_class').sort((a, b) => (b.value_num ?? 0) - (a.value_num ?? 0))
  const bottomClass = rows
    .filter((r) => r.stat_type === 'bottom_class')
    .sort((a, b) => (a.value_num ?? 0) - (b.value_num ?? 0))
  const topGpa = rows.filter((r) => r.stat_type === 'top_gpa').sort((a, b) => (b.value_num ?? 0) - (a.value_num ?? 0))

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold text-white">College0</h1>
        <p className="max-w-3xl text-zinc-300">
          College0 is a graduate program management system. Students apply for admission, register
          for classes each semester, and graduate after completing the required coursework.
          Instructors teach assigned classes and grade their students. The registrar oversees
          semesters, applications, complaints, and academic standing.
        </p>
        <p className="max-w-3xl text-sm text-zinc-500">
          The dashboard below is public — no login required. Use the navigation above to apply for
          admission, ask the AI assistant a question, or log in if you already have an account.
        </p>
      </header>

      {!user && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CallToAction
            to="/apply/student"
            title="Apply as a student"
            body="Submit your name, email, and prior GPA. The registrar reviews every application."
          />
          <CallToAction
            to="/apply/instructor"
            title="Apply as an instructor"
            body="Submit your qualifications. The registrar reviews and assigns you classes."
          />
          <CallToAction
            to="/ai"
            title="Ask the AI assistant"
            body="Questions about the program, requirements, or application process."
          />
        </section>
      )}

      {err && <p className="text-red-400">{err}</p>}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Program standings
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <RankCard
            title="Highest-rated classes"
            subtitle="Average student rating"
            rows={topClass}
            valueKind="rating"
          />
          <RankCard
            title="Lowest-rated classes"
            subtitle="Average student rating"
            rows={bottomClass}
            valueKind="rating"
          />
          <RankCard
            title="Top GPA students"
            subtitle="Cumulative GPA · names anonymized"
            rows={topGpa}
            valueKind="gpa"
            anonymize
          />
        </div>
      </section>
    </div>
  )
}

function CallToAction({ to, title, body }: { to: string; title: string; body: string }) {
  return (
    <Link
      to={to}
      className="block rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-indigo-500/60"
    >
      <div className="text-sm font-semibold text-white">{title}</div>
      <p className="mt-1 text-xs text-zinc-400">{body}</p>
    </Link>
  )
}

function RankCard({
  title,
  subtitle,
  rows,
  valueKind,
  anonymize,
}: {
  title: string
  subtitle: string
  rows: Row[]
  valueKind: 'rating' | 'gpa'
  anonymize?: boolean
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-medium text-white">{title}</h3>
      <p className="text-xs text-zinc-500">{subtitle}</p>
      <ol className="mt-3 space-y-2">
        {rows.length === 0 && <li className="text-sm text-zinc-600">No data yet.</li>}
        {rows.map((r, i) => (
          <li
            key={`${r.stat_type}-${r.rank}`}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="w-5 shrink-0 text-xs text-zinc-500">{i + 1}.</span>
              <span className="truncate text-zinc-200">
                {anonymize ? anonymizedLabel(r.label, i) : r.label}
                {!anonymize && r.value_text && (
                  <span className="ml-2 text-xs text-zinc-500">{r.value_text}</span>
                )}
              </span>
            </span>
            <span className="shrink-0 text-indigo-300">
              {valueKind === 'rating'
                ? r.value_num?.toFixed(2) ?? '—'
                : r.value_num?.toFixed(2) ?? '—'}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

// Replace the student's full name with a stable anonymous label so the public
// dashboard surfaces rankings without exposing identity.
function anonymizedLabel(name: string, idx: number): string {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 3)
  return `Student #${idx + 1}${initials ? ` (${initials}.)` : ''}`
}
