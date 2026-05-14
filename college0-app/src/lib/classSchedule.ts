/** ISO weekday: 1 = Monday … 7 = Sunday (matches Postgres `extract(isodow …)`). */
export const ISO_DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export type ClassScheduleFields = {
  course_start_date: string
  course_end_date: string
  meeting_days: number[]
  period_start: string
  period_end: string
  schedule_time?: string
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** JS Sunday=0 … Saturday=6 → ISO 1…7 */
export function jsDayToIsoDow(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay
}

function timeToMinutes(t: string): number {
  const parts = t.trim().split(':')
  const h = Number(parts[0])
  const m = Number(parts[1] ?? 0)
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  return h * 60 + m
}

function parseLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** First calendar date in [courseStart, courseEnd] whose weekday is in meetingDays (ISO). */
export function firstMeetingYmd(
  courseStart: string,
  courseEnd: string,
  meetingDays: number[],
): string | null {
  const days = new Set(meetingDays)
  const start = parseLocalDate(courseStart)
  const end = parseLocalDate(courseEnd)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (days.has(jsDayToIsoDow(d.getDay()))) return formatYmd(d)
  }
  return null
}

/** Build tsrange string for `classes.schedule_time` (first weekly session, UTC text like existing UI). */
export function firstSessionTsRange(
  courseStart: string,
  courseEnd: string,
  meetingDays: number[],
  periodStart: string,
  periodEnd: string,
): string | null {
  const ymd = firstMeetingYmd(courseStart, courseEnd, meetingDays)
  if (!ymd) return null
  const ps = periodStart.length === 5 ? `${periodStart}:00` : periodStart
  const pe = periodEnd.length === 5 ? `${periodEnd}:00` : periodEnd
  const startLocal = `${ymd}T${ps}`
  const endLocal = `${ymd}T${pe}`
  return toTsRange(startLocal, endLocal)
}

function toTsRange(a: string, b: string): string {
  const s = new Date(a).toISOString().replace('T', ' ').replace('Z', '+00')
  const e = new Date(b).toISOString().replace('T', ' ').replace('Z', '+00')
  return `[${s},${e})`
}

/** True if the two recurring schedules share a calendar day in range and their periods overlap. */
export function schedulesOverlap(a: ClassScheduleFields, b: ClassScheduleFields): boolean {
  const lo = parseLocalDate(
    a.course_start_date > b.course_start_date ? a.course_start_date : b.course_start_date,
  )
  const hi = parseLocalDate(
    a.course_end_date < b.course_end_date ? a.course_end_date : b.course_end_date,
  )
  if (lo > hi) return false

  const d1 = new Set(a.meeting_days ?? [])
  const d2 = new Set(b.meeting_days ?? [])
  const t1s = timeToMinutes(a.period_start)
  const t1e = timeToMinutes(a.period_end)
  const t2s = timeToMinutes(b.period_start)
  const t2e = timeToMinutes(b.period_end)

  for (let d = new Date(lo); d <= hi; d.setDate(d.getDate() + 1)) {
    const dow = jsDayToIsoDow(d.getDay())
    if (d1.has(dow) && d2.has(dow) && t1s < t2e && t2s < t1e) return true
  }
  return false
}

function formatWallTime(t: string): string {
  const parts = t.split(':').map((s) => Number(s))
  const hh = parts[0] ?? 0
  const mm = parts[1] ?? 0
  return new Date(2000, 0, 1, hh, mm).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatClassSchedule(c: ClassScheduleFields): string {
  const days = [...(c.meeting_days ?? [])].sort((x, y) => x - y)
  if (days.length === 0 && c.schedule_time) return formatTsRangeLegacy(c.schedule_time)

  const dayPart = days.map((n) => ISO_DAY_SHORT[n - 1] ?? `?`).join(', ')
  const datePart = `${c.course_start_date} → ${c.course_end_date}`
  return `${datePart} · ${dayPart} · ${formatWallTime(c.period_start)}–${formatWallTime(c.period_end)}`
}

function formatTsRangeLegacy(raw: string): string {
  const m = raw.match(/[[(]\s*"?([^,"]+)"?\s*,\s*"?([^,"]+)"?\s*[\])]/)
  if (!m) return raw
  const a = Date.parse(m[1])
  const b = Date.parse(m[2])
  if (Number.isNaN(a) || Number.isNaN(b)) return raw
  const d0 = new Date(a)
  const d1 = new Date(b)
  const date = d0.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${date} ${t(d0)}–${t(d1)}`
}
