import type { SupabaseClient } from '@supabase/supabase-js'

/** Semester currently in registration, running, or grading (only one should exist; enforced in DB). */
export type OperationalSemester = { id: string; name: string; phase: string }

export async function fetchOperationalSemester(
  client: SupabaseClient,
): Promise<OperationalSemester | null> {
  const { data } = await client
    .from('semesters')
    .select('id,name,phase')
    .in('phase', ['registration', 'running', 'grading'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as OperationalSemester | null
}
