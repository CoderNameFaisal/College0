import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ClassLocationsMultiMap, type ClassMapPin } from '../components/ClassLocationsMultiMap'
import { fetchOperationalSemester } from '../lib/operationalSemester'

type SemesterRow = { id: string; name: string; phase: string }

export function PublicClassLocationsPage() {
  const [semester, setSemester] = useState<SemesterRow | null>(null)
  const [pins, setPins] = useState<ClassMapPin[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const semRow = (await fetchOperationalSemester(supabase)) as SemesterRow | null

      if (cancelled) return
      setSemester(semRow)

      if (!semRow) {
        setPins([])
        setLoading(false)
        return
      }

      const { data: rows } = await supabase
        .from('classes')
        .select('course_code,title,location_lat,location_lng,location_label')
        .eq('semester_id', semRow.id)
        .eq('is_cancelled', false)

      if (cancelled) return

      const next: ClassMapPin[] = []
      for (const r of rows ?? []) {
        const row = r as {
          course_code: string
          title: string
          location_lat: number | null
          location_lng: number | null
          location_label: string | null
        }
        if (row.location_lat != null && row.location_lng != null) {
          next.push({
            lat: row.location_lat,
            lng: row.location_lng,
            title: `${row.course_code} · ${row.title}`,
            subtitle: row.location_label ?? undefined,
          })
        }
      }
      setPins(next)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Course locations</h1>
        <p className="text-sm text-zinc-500">
          Map of meeting pins for the semester in registration, running, or grading (OpenStreetMap). No
          account required.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : !semester ? (
        <p className="text-sm text-zinc-500">
          No semester is in registration, running, or grading — there is nothing to map for students
          yet.
        </p>
      ) : (
        <>
          <p className="text-xs text-zinc-500">
            Semester: <span className="text-zinc-300">{semester.name}</span> ({semester.phase}) ·{' '}
            {pins.length} section{pins.length === 1 ? '' : 's'} with a map pin
          </p>
          <ClassLocationsMultiMap pins={pins} height={360} />
        </>
      )}
    </div>
  )
}
