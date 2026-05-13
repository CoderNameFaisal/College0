import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

type ClassRow = {
  id: string
  course_code: string
  title: string
  avg_rating: number | null
}

// Author is deliberately NOT selected here — instructors must not see review authors.
type Review = {
  id: string
  class_id: string
  stars: number
  filtered_body: string | null
  body: string
  is_hidden: boolean
  created_at: string
}

export function InstructorReviewsPage() {
  const { user } = useAuth()
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [reviews, setReviews] = useState<Record<string, Review[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user) return
      const { data: cs } = await supabase
        .from('classes')
        .select('id,course_code,title,avg_rating')
        .eq('instructor_id', user.id)
        .order('course_code')
      const list = (cs as ClassRow[]) ?? []
      if (cancelled) return
      setClasses(list)

      if (list.length > 0) {
        const { data: rs } = await supabase
          .from('reviews')
          .select('id,class_id,stars,filtered_body,body,is_hidden,created_at')
          .in(
            'class_id',
            list.map((c) => c.id),
          )
          .order('created_at', { ascending: false })
        if (cancelled) return
        const grouped: Record<string, Review[]> = {}
        for (const r of ((rs ?? []) as Review[])) {
          if (!grouped[r.class_id]) grouped[r.class_id] = []
          grouped[r.class_id].push(r)
        }
        setReviews(grouped)
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Reviews</h1>
      <p className="text-xs text-zinc-500">
        Author identities are hidden from instructors. Each review shows only the rating and content.
      </p>

      {classes.length === 0 ? (
        <p className="text-sm text-zinc-500">No classes assigned.</p>
      ) : (
        <ul className="space-y-4">
          {classes.map((c) => {
            const rs = reviews[c.id] ?? []
            return (
              <li key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm text-white">
                    {c.course_code} · {c.title}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Avg rating:{' '}
                    <span className="text-zinc-200">
                      {c.avg_rating === null ? '—' : c.avg_rating.toFixed(2)}
                    </span>{' '}
                    · {rs.length} review{rs.length === 1 ? '' : 's'}
                  </div>
                </div>

                {rs.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-500">No reviews yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {rs.map((r) => (
                      <li
                        key={r.id}
                        className="rounded border border-zinc-800 bg-zinc-950/40 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between text-xs text-zinc-500">
                          <span>
                            {'★'.repeat(r.stars)}
                            {'☆'.repeat(5 - r.stars)}
                          </span>
                          <span>
                            {new Date(r.created_at).toLocaleDateString()}
                            {r.is_hidden && (
                              <span className="ml-2 text-amber-300">hidden by filter</span>
                            )}
                          </span>
                        </div>
                        <p className="mt-1 text-zinc-200">{r.filtered_body ?? r.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
