import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ClassLocationPicker } from '../../components/ClassLocationPicker'
import { ClassLocationMap } from '../../components/ClassLocationMap'
import { ClassLocationsMultiMap, type ClassMapPin } from '../../components/ClassLocationsMultiMap'
import {
  ISO_DAY_SHORT,
  firstMeetingYmd,
  firstSessionTsRange,
  formatClassSchedule,
  type ClassScheduleFields,
} from '../../lib/classSchedule'

type ClassRow = ClassScheduleFields & {
  id: string
  course_code: string
  title: string
  semester_id: string
  instructor_id: string | null
  schedule_time: string
  max_students: number
  is_cancelled: boolean
  location_lat: number | null
  location_lng: number | null
  location_label: string | null
}

type Profile = { id: string; full_name: string; role: string }

const ISO_DAYS = [1, 2, 3, 4, 5, 6, 7] as const

export function RegistrarClassesPage() {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [semesters, setSemesters] = useState<{ id: string; name: string }[]>([])
  const [instructors, setInstructors] = useState<Profile[]>([])
  const [semesterId, setSemesterId] = useState('')
  const [code, setCode] = useState('CS501')
  const [title, setTitle] = useState('Distributed Systems')
  const [instructorId, setInstructorId] = useState('')
  const [maxStudents, setMaxStudents] = useState(10)
  const [courseStart, setCourseStart] = useState('2026-09-01')
  const [courseEnd, setCourseEnd] = useState('2026-12-15')
  const [meetingDays, setMeetingDays] = useState<number[]>([1, 3])
  const [periodStart, setPeriodStart] = useState('14:00')
  const [periodEnd, setPeriodEnd] = useState('15:30')
  const [locationLat, setLocationLat] = useState<number | null>(null)
  const [locationLng, setLocationLng] = useState<number | null>(null)
  const [locationLabel, setLocationLabel] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const mapPins = useMemo((): ClassMapPin[] => {
    return classes
      .filter((c) => c.location_lat != null && c.location_lng != null)
      .map((c) => ({
        lat: c.location_lat as number,
        lng: c.location_lng as number,
        title: `${c.course_code} · ${c.title}`,
        subtitle: c.location_label ?? undefined,
      }))
  }, [classes])

  function toggleDay(isoDow: number) {
    setMeetingDays((prev) =>
      prev.includes(isoDow) ? prev.filter((d) => d !== isoDow) : [...prev, isoDow].sort((a, b) => a - b),
    )
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
    if (meetingDays.length === 0) {
      setMsg('Select at least one day of the week.')
      return
    }
    if (courseEnd < courseStart) {
      setMsg('Course end date must be on or after course start date.')
      return
    }
    const pStart = periodStart.length === 5 ? `${periodStart}:00` : periodStart
    const pEnd = periodEnd.length === 5 ? `${periodEnd}:00` : periodEnd
    if (pStart >= pEnd) {
      setMsg('Period end must be after period start.')
      return
    }
    if (!firstMeetingYmd(courseStart, courseEnd, meetingDays)) {
      setMsg('No selected weekday falls between the course start and end dates.')
      return
    }
    const schedule_time = firstSessionTsRange(courseStart, courseEnd, meetingDays, periodStart, periodEnd)
    if (!schedule_time) {
      setMsg('Could not derive a schedule window.')
      return
    }

    const row: Record<string, unknown> = {
      semester_id: semesterId,
      course_code: code,
      title,
      instructor_id: instructorId || null,
      course_start_date: courseStart,
      course_end_date: courseEnd,
      meeting_days: meetingDays,
      period_start: pStart,
      period_end: pEnd,
      schedule_time,
      max_students: maxStudents,
    }
    if (locationLat != null && locationLng != null) {
      row.location_lat = locationLat
      row.location_lng = locationLng
      row.location_label = locationLabel.trim() || null
    }

    const { error } = await supabase.from('classes').insert(row)
    if (error) setMsg(error.message)
    else {
      setLocationLat(null)
      setLocationLng(null)
      setLocationLabel('')
      void load()
    }
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
          <span className="text-xs text-zinc-500">Course start (first day instruction may begin)</span>
          <input
            type="date"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            value={courseStart}
            onChange={(e) => setCourseStart(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Course end (last day instruction)</span>
          <input
            type="date"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            value={courseEnd}
            onChange={(e) => setCourseEnd(e.target.value)}
          />
        </label>

        <div className="space-y-2 md:col-span-2">
          <span className="text-xs text-zinc-500">Meets on (weekdays)</span>
          <div className="flex flex-wrap gap-2">
            {ISO_DAYS.map((d) => (
              <label
                key={d}
                className="flex cursor-pointer items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:border-zinc-500"
              >
                <input
                  type="checkbox"
                  checked={meetingDays.includes(d)}
                  onChange={() => toggleDay(d)}
                />
                {ISO_DAY_SHORT[d - 1]}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500">
            Uses ISO weekdays (Mon=1 … Sun=7), matching enrollment conflict checks.
          </p>
        </div>

        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Period starts (each meeting day)</span>
          <input
            type="time"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Period ends</span>
          <input
            type="time"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
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

        <ClassLocationPicker
          lat={locationLat}
          lng={locationLng}
          onChange={(la, ln) => {
            setLocationLat(la)
            setLocationLng(ln)
          }}
          label={locationLabel}
          onLabelChange={setLocationLabel}
        />

        <div className="flex items-end">
          <button type="submit" className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500">
            Create class
          </button>
        </div>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-white">All section pins (current list)</h2>
        <ClassLocationsMultiMap pins={mapPins} height={300} />
      </section>

      <ul className="space-y-2">
        {classes.map((c) => (
          <li key={c.id} className="rounded border border-zinc-800 px-3 py-2 text-sm text-zinc-300">
            <span className="font-mono text-indigo-300">{c.course_code}</span> · {c.title}
            <div className="mt-1 text-xs text-zinc-500">{formatClassSchedule(c)}</div>
            {c.location_label && (
              <div className="mt-1 text-xs text-zinc-400">Location: {c.location_label}</div>
            )}
            {c.location_lat != null && c.location_lng != null && (
              <div className="mt-2 max-w-md">
                <ClassLocationMap lat={c.location_lat} lng={c.location_lng} height={160} />
              </div>
            )}
            {c.is_cancelled && <span className="ml-2 text-red-400">cancelled</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
