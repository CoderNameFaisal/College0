import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fetchOperationalSemester } from '../../lib/operationalSemester'

type Stats = {
  pendingApplications: number
  openComplaints: number
  pendingGraduation: number
  activeStudents: number
  suspendedStudents: number
  terminatedStudents: number
  activeInstructors: number
  needsInterview: number
  currentPhase: string | null
  currentSemester: string | null
}

const emptyStats: Stats = {
  pendingApplications: 0,
  openComplaints: 0,
  pendingGraduation: 0,
  activeStudents: 0,
  suspendedStudents: 0,
  terminatedStudents: 0,
  activeInstructors: 0,
  needsInterview: 0,
  currentPhase: null,
  currentSemester: null,
}

export function RegistrarHome() {
  const [stats, setStats] = useState<Stats>(emptyStats)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [apps, complaints, grads, profiles, semester] = await Promise.all([
        supabase.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('complaints').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase
          .from('graduation_applications')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase.from('profiles').select('role,status,cumulative_gpa'),
        fetchOperationalSemester(supabase),
      ])

      const profileRows = (profiles.data ?? []) as {
        role: string
        status: string
        cumulative_gpa: number | null
      }[]

      const next: Stats = {
        pendingApplications: apps.count ?? 0,
        openComplaints: complaints.count ?? 0,
        pendingGraduation: grads.count ?? 0,
        activeStudents: profileRows.filter((p) => p.role === 'student' && p.status === 'active').length,
        suspendedStudents: profileRows.filter((p) => p.role === 'student' && p.status === 'suspended').length,
        terminatedStudents: profileRows.filter((p) => p.role === 'student' && p.status === 'terminated').length,
        activeInstructors: profileRows.filter((p) => p.role === 'instructor' && p.status === 'active').length,
        needsInterview: profileRows.filter(
          (p) =>
            p.role === 'student' &&
            p.status === 'active' &&
            p.cumulative_gpa !== null &&
            p.cumulative_gpa >= 2.0 &&
            p.cumulative_gpa < 2.25,
        ).length,
        currentPhase: semester?.phase ?? null,
        currentSemester: semester?.name ?? null,
      }

      if (!cancelled) {
        setStats(next)
        setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Registrar console</h1>
        <p className="text-sm text-zinc-400">
          {stats.currentSemester
            ? `Current semester: ${stats.currentSemester} (${stats.currentPhase})`
            : 'No semester in registration, running, or grading. Create or advance one under Semester management.'}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Action queue</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ActionTile
            to="/registrar/applications"
            label="Pending applications"
            value={loading ? '…' : stats.pendingApplications}
            tone={stats.pendingApplications > 0 ? 'amber' : 'neutral'}
          />
          <ActionTile
            to="/registrar/complaints"
            label="Open complaints"
            value={loading ? '…' : stats.openComplaints}
            tone={stats.openComplaints > 0 ? 'amber' : 'neutral'}
          />
          <ActionTile
            to="/registrar/graduation"
            label="Graduation applications"
            value={loading ? '…' : stats.pendingGraduation}
            tone={stats.pendingGraduation > 0 ? 'amber' : 'neutral'}
          />
          <ActionTile
            to="/registrar/students?filter=needs-interview"
            label="Students needing interview"
            value={loading ? '…' : stats.needsInterview}
            tone={stats.needsInterview > 0 ? 'amber' : 'neutral'}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">People</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Active students" value={loading ? '…' : stats.activeStudents} />
          <StatTile label="Suspended students" value={loading ? '…' : stats.suspendedStudents} />
          <StatTile label="Terminated students" value={loading ? '…' : stats.terminatedStudents} />
          <StatTile label="Active instructors" value={loading ? '…' : stats.activeInstructors} />
        </div>
      </section>
    </div>
  )
}

type Tone = 'neutral' | 'amber'

function ActionTile({
  to,
  label,
  value,
  tone,
}: {
  to: string
  label: string
  value: number | string
  tone: Tone
}) {
  const toneClass =
    tone === 'amber' ? 'border-amber-700/60 bg-amber-950/30' : 'border-zinc-800 bg-zinc-900/40'
  return (
    <Link
      to={to}
      className={`flex flex-col rounded-lg border p-4 transition-colors hover:border-indigo-500/60 ${toneClass}`}
    >
      <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="mt-2 text-2xl font-semibold text-white">{value}</span>
    </Link>
  )
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="mt-2 text-2xl font-semibold text-white">{value}</span>
    </div>
  )
}
