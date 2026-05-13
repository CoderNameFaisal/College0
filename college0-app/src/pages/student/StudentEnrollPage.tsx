import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import type { EnrollmentStatus, GradeLetter, SemesterPhase } from '../../types/database'

type SemesterRow = { id: string; name: string; phase: SemesterPhase }

type ClassRow = {
  id: string
  course_code: string
  title: string
  schedule_time: string
  max_students: number
  is_cancelled: boolean
  instructor: { full_name: string } | null
}

type Enrollment = {
  id: string
  status: EnrollmentStatus
  grade: GradeLetter | null
  class_id: string
  class: { course_code: string; title: string; schedule_time: string } | null
}

export function StudentEnrollPage() {
  const { user, profile } = useAuth()
  const [semester, setSemester] = useState<SemesterRow | null>(null)
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [classCounts, setClassCounts] = useState<Record<string, number>>({})
  const [myCurrent, setMyCurrent] = useState<Enrollment[]>([])
  const [myHistory, setMyHistory] = useState<Enrollment[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    const { data: sem } = await supabase
      .from('semesters')
      .select('id,name,phase')
      .neq('phase', 'closed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const semRow = sem as SemesterRow | null
    setSemester(semRow)

    if (!semRow) {
      setClasses([])
      setMyCurrent([])
      setMyHistory([])
      setLoading(false)
      return
    }

    const [cls, mine, hist, counts] = await Promise.all([
      supabase
        .from('classes')
        .select('id,course_code,title,schedule_time,max_students,is_cancelled,instructor:profiles!classes_instructor_id_fkey(full_name)')
        .eq('semester_id', semRow.id)
        .eq('is_cancelled', false)
        .order('course_code'),
      supabase
        .from('enrollments')
        .select(
          'id,status,grade,class_id,class:classes(course_code,title,schedule_time)',
        )
        .eq('student_id', user.id)
        .eq('semester_id', semRow.id)
        .neq('status', 'dropped'),
      supabase
        .from('enrollments')
        .select('id,status,grade,class_id,class:classes(course_code,title,schedule_time)')
        .eq('student_id', user.id)
        .not('grade', 'is', null),
      supabase
        .from('enrollments')
        .select('class_id,status')
        .eq('status', 'enrolled'),
    ])

    setClasses((cls.data as unknown as ClassRow[]) ?? [])
    setMyCurrent((mine.data as unknown as Enrollment[]) ?? [])
    setMyHistory((hist.data as unknown as Enrollment[]) ?? [])

    const counter: Record<string, number> = {}
    for (const e of ((counts.data as { class_id: string }[]) ?? [])) {
      counter[e.class_id] = (counter[e.class_id] ?? 0) + 1
    }
    setClassCounts(counter)
    setLoading(false)
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  const myClassIds = useMemo(() => new Set(myCurrent.map((e) => e.class_id)), [myCurrent])
  const passedCourseCodes = useMemo(() => {
    return new Set(
      myHistory
        .filter((e) => e.grade !== null && e.grade !== 'F' && e.status === 'enrolled')
        .map((e) => e.class?.course_code)
        .filter(Boolean) as string[],
    )
  }, [myHistory])

  const registrationOpen =
    semester?.phase === 'registration' || profile?.special_registration_eligible === true

  async function enroll(classId: string) {
    setMsg(null)
    setBusy(classId)
    const { error } = await supabase.rpc('rpc_enroll_in_class', { p_class_id: classId })
    setBusy(null)
    if (error) setMsg(error.message)
    else {
      setMsg('Enrolled or waitlisted.')
      await load()
    }
  }

  async function drop(enrollmentId: string) {
    setMsg(null)
    setBusy(enrollmentId)
    const { error } = await supabase.rpc('rpc_drop_class', { p_enrollment_id: enrollmentId })
    setBusy(null)
    if (error) setMsg(error.message)
    else {
      setMsg('Dropped.')
      await load()
    }
  }

  function classConflictsWith(c: ClassRow) {
    return myCurrent.some(
      (e) => e.class && e.class.schedule_time && rangesOverlap(e.class.schedule_time, c.schedule_time),
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Course registration</h1>
        <p className="text-sm text-zinc-500">
          {semester ? (
            <>
              {semester.name} · <span className="text-zinc-300">{semester.phase}</span> phase
            </>
          ) : (
            'No active semester.'
          )}
        </p>
      </div>

      {!registrationOpen && (
        <div className="rounded border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          Registration is closed{' '}
          {semester ? `(semester is in ${semester.phase} phase)` : ''}. You can browse classes but
          can't enroll right now.
          {profile?.special_registration_eligible && (
            <span className="block text-emerald-300">
              You have a special re-registration window because a class of yours was cancelled.
            </span>
          )}
        </div>
      )}

      {msg && <p className="text-sm text-amber-300">{msg}</p>}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Your current registration</h2>
          <span className="text-xs text-zinc-500">
            {myCurrent.length} / 4 courses
          </span>
        </div>
        {myCurrent.length === 0 ? (
          <p className="text-sm text-zinc-500">No classes registered.</p>
        ) : (
          <ul className="space-y-2">
            {myCurrent.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm"
              >
                <div>
                  <span className="text-white">
                    {e.class?.course_code} · {e.class?.title}
                  </span>
                  <span className="ml-2 text-xs text-zinc-500">
                    {e.class && formatTsRange(e.class.schedule_time)} · {e.status}
                  </span>
                </div>
                {registrationOpen && (
                  <button
                    type="button"
                    onClick={() => void drop(e.id)}
                    disabled={busy === e.id}
                    className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Drop
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Available classes</h2>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : classes.length === 0 ? (
          <p className="text-sm text-zinc-500">No classes for the current semester.</p>
        ) : (
          <ul className="space-y-2">
            {classes.map((c) => {
              const enrolledN = classCounts[c.id] ?? 0
              const full = enrolledN >= c.max_students
              const alreadyIn = myClassIds.has(c.id)
              const alreadyPassed = passedCourseCodes.has(c.course_code)
              const conflict = !alreadyIn && classConflictsWith(c)
              const atMax = myCurrent.length >= 4
              const seatsLeft = Math.max(0, c.max_students - enrolledN)

              let disabledReason: string | null = null
              if (alreadyPassed) disabledReason = 'Already passed this course'
              else if (alreadyIn) disabledReason = 'Already in your schedule'
              else if (!registrationOpen) disabledReason = 'Registration closed'
              else if (atMax) disabledReason = 'You already have 4 courses'
              else if (conflict) disabledReason = 'Time conflicts with another registered class'

              const buttonLabel = full ? 'Join waitlist' : 'Enroll'

              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-baseline justify-between gap-3 rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-white">
                      {c.course_code} · {c.title}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {formatTsRange(c.schedule_time)} ·{' '}
                      {c.instructor?.full_name ?? 'TBA'} ·{' '}
                      <span className={full ? 'text-amber-300' : 'text-emerald-300'}>
                        {seatsLeft} of {c.max_students} seats left
                      </span>
                      {disabledReason && (
                        <span className="ml-2 text-red-300">{disabledReason}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void enroll(c.id)}
                    disabled={!!disabledReason || busy === c.id}
                    title={disabledReason ?? undefined}
                    className={`rounded px-3 py-1.5 text-xs text-white disabled:opacity-40 ${
                      full
                        ? 'bg-amber-700 hover:bg-amber-600'
                        : 'bg-indigo-600 hover:bg-indigo-500'
                    }`}
                  >
                    {buttonLabel}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        Constraints enforced server-side: 2–4 courses per semester, no time conflicts, retake only
        after an F. Capacity is checked at enrollment time.
      </p>
    </div>
  )
}

function rangesOverlap(a: string, b: string): boolean {
  const A = parseTsRange(a)
  const B = parseTsRange(b)
  if (!A || !B) return false
  return A[0] < B[1] && B[0] < A[1]
}

function parseTsRange(raw: string): [number, number] | null {
  const m = raw.match(/[[(]\s*"?([^,"]+)"?\s*,\s*"?([^,"]+)"?\s*[\])]/)
  if (!m) return null
  const a = Date.parse(m[1])
  const b = Date.parse(m[2])
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return [a, b]
}

function formatTsRange(raw: string): string {
  const r = parseTsRange(raw)
  if (!r) return raw
  const a = new Date(r[0])
  const b = new Date(r[1])
  const date = a.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${date} ${t(a)}–${t(b)}`
}
