import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchOperationalSemester } from '../lib/operationalSemester'
import type { SemesterPhase } from '../types/database'

export type OperationalSemesterRow = { id: string; name: string; phase: SemesterPhase }

export type TermEnrollmentRow = {
  id: string
  status: string
  class: { course_code: string; title: string } | null
}

/** Loads operational semester + this student's enrollments + catalog size (students only). */
export function useStudentOperationalTerm(userId: string | undefined, role: string | null | undefined) {
  const [semester, setSemester] = useState<OperationalSemesterRow | null>(null)
  const [enrollments, setEnrollments] = useState<TermEnrollmentRow[]>([])
  const [catalogCount, setCatalogCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!userId || role !== 'student') {
      setSemester(null)
      setEnrollments([])
      setCatalogCount(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const sem = (await fetchOperationalSemester(supabase)) as OperationalSemesterRow | null
    setSemester(sem)
    if (!sem) {
      setEnrollments([])
      setCatalogCount(null)
      setLoading(false)
      return
    }
    const [enr, cnt] = await Promise.all([
      supabase
        .from('enrollments')
        .select('id,status,class:classes(course_code,title)')
        .eq('student_id', userId)
        .eq('semester_id', sem.id)
        .neq('status', 'dropped'),
      supabase
        .from('classes')
        .select('id', { count: 'exact', head: true })
        .eq('semester_id', sem.id)
        .eq('is_cancelled', false),
    ])
    setEnrollments((enr.data as unknown as TermEnrollmentRow[]) ?? [])
    setCatalogCount(cnt.count ?? 0)
    setLoading(false)
  }, [userId, role])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { semester, enrollments, catalogCount, loading, refresh }
}
