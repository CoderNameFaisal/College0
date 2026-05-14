import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { fetchOperationalSemester } from '../../lib/operationalSemester'
import type { EnrollmentStatus, GradeLetter, SemesterPhase } from '../../types/database'

type SemesterRow = {
  id: string
  name: string
  phase: SemesterPhase
}

type Enrollment = {
  id: string
  status: EnrollmentStatus
  grade: GradeLetter | null
  class: { course_code: string; title: string } | null
}

const gradePoints: Record<GradeLetter, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 }

export function StudentHomePage() {
  const { user, profile } = useAuth()
  const [semester, setSemester] = useState<SemesterRow | null>(null)
  const [current, setCurrent] = useState<Enrollment[]>([])
  const [allPassing, setAllPassing] = useState(0)
  const [openComplaints, setOpenComplaints] = useState(0)
  const [hasGradApp, setHasGradApp] = useState(false)
  const [loading, setLoading] = useState(true)

  // Real-time warning notifications
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`warnings-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'warnings',
          filter: `target_id=eq.${user.id}`,
        },
        () => {
          window.alert('You received a new warning.')
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user) return
      const semRow = (await fetchOperationalSemester(supabase)) as SemesterRow | null
      if (cancelled) return
      setSemester(semRow)

      const [cur, passing, comp, grad] = await Promise.all([
        supabase
          .from('enrollments')
          .select('id,status,grade,class:classes(course_code,title)')
          .eq('student_id', user.id)
          .eq('semester_id', semRow?.id ?? '00000000-0000-0000-0000-000000000000')
          .neq('status', 'dropped'),
        supabase
          .from('enrollments')
          .select('class:classes(course_code)')
          .eq('student_id', user.id)
          .eq('status', 'enrolled')
          .not('grade', 'is', null)
          .neq('grade', 'F'),
        supabase
          .from('complaints')
          .select('id', { count: 'exact', head: true })
          .eq('filed_by', user.id)
          .eq('status', 'open'),
        supabase
          .from('graduation_applications')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', user.id)
          .eq('status', 'pending'),
      ])
      if (cancelled) return

      setCurrent((cur.data as unknown as Enrollment[]) ?? [])
      const passingRows =
        (passing.data as unknown as { class: { course_code: string } | null }[]) ?? []
      const distinct = new Set(
        passingRows.map((r) => r.class?.course_code).filter(Boolean) as string[],
      )
      setAllPassing(distinct.size)
      setOpenComplaints(comp.count ?? 0)
      setHasGradApp((grad.count ?? 0) > 0)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  const isHonorRoll =
    profile?.cumulative_gpa !== null &&
    profile?.cumulative_gpa !== undefined &&
    profile.cumulative_gpa >= 3.5 &&
    (profile.honor_roll_count ?? 0) > 1

  const interviewFlag =
    profile?.status === 'active' &&
    profile?.cumulative_gpa !== null &&
    profile?.cumulative_gpa !== undefined &&
    profile.cumulative_gpa >= 2.0 &&
    profile.cumulative_gpa < 2.25

  const semesterGpaApprox = (() => {
    const graded = current.filter((e) => e.grade !== null)
    if (graded.length === 0) return null
    const sum = graded.reduce((a, e) => a + gradePoints[e.grade as GradeLetter], 0)
    return (sum / graded.length).toFixed(2)
  })()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">
          Welcome, {profile?.full_name ?? 'student'}
        </h1>
        <p className="text-sm text-zinc-400">
          {semester ? (
            <>
              {semester.name} · <span className="text-zinc-300">{semester.phase}</span> phase
            </>
          ) : (
            'No active semester.'
          )}
        </p>
      </div>

      {profile?.status === 'suspended' && (
        <div className="rounded border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          Your account is <strong>suspended</strong>. Contact the registrar.
        </div>
      )}
      {profile?.status === 'terminated' && (
        <div className="rounded border border-red-700/60 bg-red-950/30 p-3 text-sm text-red-200">
          Your enrollment has been <strong>terminated</strong>.
        </div>
      )}
      {profile?.status === 'graduated' && (
        <div className="rounded border border-indigo-700/60 bg-indigo-950/30 p-3 text-sm text-indigo-200">
          🎓 Congratulations — you have graduated.
        </div>
      )}
      {interviewFlag && (
        <div className="rounded border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          Your cumulative GPA is between 2.0 and 2.25 — the registrar will meet with you.
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cumulative GPA" value={profile?.cumulative_gpa ?? '—'} />
        <Stat label="Semester GPA" value={semesterGpaApprox ?? '—'} />
        <Stat label="Warnings" value={profile?.warning_count ?? 0} />
        <Stat
          label="Status"
          value={profile?.status ?? '—'}
          accent={isHonorRoll ? 'honor' : undefined}
        />
      </section>

      {isHonorRoll && (
        <div className="rounded border border-indigo-700/40 bg-indigo-950/30 px-3 py-2 text-sm text-indigo-200">
          ⭐ Honor roll
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          This semester
        </h2>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : current.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
            <p className="text-zinc-300">No courses registered for the current semester.</p>
            {semester?.phase === 'registration' && (
              <Link
                to="/student/enroll"
                className="mt-2 inline-block text-indigo-300 hover:underline"
              >
                Browse available classes →
              </Link>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {current.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm"
              >
                <div className="text-white">
                  {e.class?.course_code} · {e.class?.title}
                </div>
                <div className="text-xs text-zinc-500">
                  {e.status}
                  {e.grade && <span className="ml-2 text-zinc-200">grade {e.grade}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Quick links
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ActionTile
            to="/student/profile"
            label="My profile & records"
            sub={`${allPassing} passing course${allPassing === 1 ? '' : 's'}`}
          />
          <ActionTile
            to="/student/enroll"
            label="Course registration"
            sub={
              semester?.phase === 'registration'
                ? 'Open'
                : profile?.special_registration_eligible
                  ? 'Special window'
                  : 'Closed'
            }
            tone={
              semester?.phase === 'registration' || profile?.special_registration_eligible
                ? 'emerald'
                : 'neutral'
            }
          />
          <ActionTile
            to="/student/graduation"
            label="Graduation application"
            sub={
              hasGradApp
                ? 'Already submitted'
                : allPassing >= 8
                  ? 'Eligible to apply'
                  : `${allPassing}/8 courses`
            }
            tone={allPassing >= 8 && !hasGradApp ? 'emerald' : 'neutral'}
          />
          <ActionTile
            to="/student/complaints"
            label="Complaints"
            sub={openComplaints > 0 ? `${openComplaints} open` : 'File a complaint'}
          />
        </div>
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: 'honor'
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        accent === 'honor'
          ? 'border-indigo-700/60 bg-indigo-950/30'
          : 'border-zinc-800 bg-zinc-900/40'
      }`}
    >
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  )
}

function ActionTile({
  to,
  label,
  sub,
  tone = 'neutral',
}: {
  to: string
  label: string
  sub: string
  tone?: 'neutral' | 'emerald'
}) {
  const t =
    tone === 'emerald' ? 'border-emerald-700/60 bg-emerald-950/30' : 'border-zinc-800 bg-zinc-900/40'
  return (
    <Link
      to={to}
      className={`flex flex-col rounded-lg border p-4 transition-colors hover:border-indigo-500/60 ${t}`}
    >
      <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="mt-2 text-sm text-white">{sub}</span>
    </Link>
  )
}
