import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { formatClassSchedule, schedulesOverlap, type ClassScheduleFields } from '../../lib/classSchedule'
import type { EnrollmentStatus, GradeLetter, SemesterPhase } from '../../types/database'
import { ClassLocationMap } from '../../components/ClassLocationMap'
import { CourseGeminiPanel } from '../../components/CourseGeminiPanel'

type SemesterRow = { id: string; name: string; phase: SemesterPhase }

type ClassRow = ClassScheduleFields & {
  id: string
  course_code: string
  title: string
  schedule_time: string
  max_students: number
  is_cancelled: boolean
  location_lat: number | null
  location_lng: number | null
  location_label: string | null
  instructor: { full_name: string } | null
}

type Enrollment = {
  id: string
  status: EnrollmentStatus
  grade: GradeLetter | null
  class_id: string
  class: (ClassScheduleFields & {
    course_code: string
    title: string
    schedule_time: string
    location_lat: number | null
    location_lng: number | null
    location_label: string | null
  }) | null
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
        .select(
          'id,course_code,title,schedule_time,course_start_date,course_end_date,meeting_days,period_start,period_end,max_students,is_cancelled,location_lat,location_lng,location_label,instructor:profiles!classes_instructor_id_fkey(full_name)',
        )
        .eq('semester_id', semRow.id)
        .eq('is_cancelled', false)
        .order('course_code'),
      supabase
        .from('enrollments')
        .select(
          'id,status,grade,class_id,class:classes(course_code,title,schedule_time,course_start_date,course_end_date,meeting_days,period_start,period_end,location_lat,location_lng,location_label)',
        )
        .eq('student_id', user.id)
        .eq('semester_id', semRow.id)
        .neq('status', 'dropped'),
      supabase
        .from('enrollments')
        .select(
          'id,status,grade,class_id,class:classes(course_code,title,schedule_time,course_start_date,course_end_date,meeting_days,period_start,period_end,location_lat,location_lng,location_label)',
        )
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
    return myCurrent.some((e) => {
      const o = e.class
      if (!o?.meeting_days?.length || !c.meeting_days?.length) return false
      return schedulesOverlap(
        {
          course_start_date: o.course_start_date,
          course_end_date: o.course_end_date,
          meeting_days: o.meeting_days,
          period_start: o.period_start,
          period_end: o.period_end,
          schedule_time: o.schedule_time,
        },
        c,
      )
    })
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
                className="space-y-2 rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="text-white">
                      {e.class?.course_code} · {e.class?.title}
                    </span>
                    <span className="ml-2 text-xs text-zinc-500">
                      {e.class && formatClassSchedule(e.class)} · {e.status}
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
                </div>
                {e.class?.location_lat != null && e.class?.location_lng != null && (
                  <div className="w-full max-w-md">
                    {e.class.location_label && (
                      <p className="mb-1 text-xs text-zinc-400">{e.class.location_label}</p>
                    )}
                    <ClassLocationMap lat={e.class.location_lat} lng={e.class.location_lng} height={160} />
                  </div>
                )}
                {e.class_id && e.class?.course_code && e.class?.title && (
                  <CourseGeminiPanel
                    classId={e.class_id}
                    courseCode={e.class.course_code}
                    title={e.class.title}
                  />
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
                      {formatClassSchedule(c)} ·{' '}
                      {c.instructor?.full_name ?? 'TBA'} ·{' '}
                      <span className={full ? 'text-amber-300' : 'text-emerald-300'}>
                        {seatsLeft} of {c.max_students} seats left
                      </span>
                      {disabledReason && (
                        <span className="ml-2 text-red-300">{disabledReason}</span>
                      )}
                    </div>
                    {c.location_lat != null && c.location_lng != null && (
                      <div className="mt-2 w-full max-w-md">
                        {c.location_label && (
                          <p className="mb-1 text-xs text-zinc-400">{c.location_label}</p>
                        )}
                        <ClassLocationMap lat={c.location_lat} lng={c.location_lng} height={180} />
                      </div>
                    )}
                    {alreadyIn && (
                      <CourseGeminiPanel
                        classId={c.id}
                        courseCode={c.course_code}
                        title={c.title}
                      />
                    )}
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
