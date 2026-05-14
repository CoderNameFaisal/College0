import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { invokeEdgeSession } from '../../lib/invokeEdge'
import { useAuth } from '../../hooks/useAuth'
import type { GradeLetter, SemesterPhase } from '../../types/database'

type ReviewableClass = {
  enrollment_id: string
  class_id: string
  course_code: string
  title: string
  grade: GradeLetter | null
  phase: SemesterPhase
  alreadyReviewed: boolean
}

type MyReview = {
  id: string
  class_id: string
  stars: number
  body: string
  filtered_body: string | null
  is_hidden: boolean
  created_at: string
}

export function StudentReviewsPage() {
  const { user } = useAuth()
  const [reviewable, setReviewable] = useState<ReviewableClass[]>([])
  const [myReviews, setMyReviews] = useState<MyReview[]>([])
  const [target, setTarget] = useState<string>('')
  const [stars, setStars] = useState(5)
  const [body, setBody] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    const [enr, mine] = await Promise.all([
      supabase
        .from('enrollments')
        .select(
          'id,class_id,grade,class:classes(course_code,title,semester:semesters(phase))',
        )
        .eq('student_id', user.id)
        .eq('status', 'enrolled'),
      supabase
        .from('reviews')
        .select('id,class_id,stars,body,filtered_body,is_hidden,created_at')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false }),
    ])

    const mineRows = (mine.data as MyReview[]) ?? []
    const reviewedClassIds = new Set(mineRows.map((r) => r.class_id))

    const enrRows =
      ((enr.data as unknown as Array<{
        id: string
        class_id: string
        grade: GradeLetter | null
        class: { course_code: string; title: string; semester: { phase: SemesterPhase } | null } | null
      }>) ?? []).map<ReviewableClass>((e) => ({
        enrollment_id: e.id,
        class_id: e.class_id,
        course_code: e.class?.course_code ?? '?',
        title: e.class?.title ?? '?',
        grade: e.grade,
        phase: e.class?.semester?.phase ?? 'closed',
        alreadyReviewed: reviewedClassIds.has(e.class_id),
      }))
    setReviewable(enrRows)
    setMyReviews(mineRows)
    if (!target && enrRows.length > 0) {
      const open = enrRows.find((r) => canReview(r))
      if (open) setTarget(open.class_id)
    }
    setLoading(false)
  }, [user, target])

  useEffect(() => {
    void load()
  }, [load])

  function canReview(r: ReviewableClass) {
    return r.phase === 'running' && r.grade === null && !r.alreadyReviewed
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setOk(null)
    if (!target || !body.trim()) {
      setMsg('Pick a class and write a review.')
      return
    }
    setSubmitting(true)
    try {
      const r = (await invokeEdgeSession('submit-review', {
        class_id: target,
        stars,
        body: body.trim(),
      })) as { matches: number; is_hidden: boolean }
      if (r.is_hidden) {
        setOk(
          'This review was not published (severe taboo language). Two warnings were issued to your account.',
        )
      } else if (r.matches > 0) {
        setOk(
          `Review published with flagged words replaced by asterisks. One warning was issued (${r.matches} taboo list match(es)).`,
        )
      } else {
        setOk('Review submitted.')
      }
      setBody('')
      await load()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const eligible = reviewable.filter(canReview)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Reviews</h1>
        <p className="text-sm text-zinc-500">
          Reviews are anonymous (only the registrar can see authors). You can review classes during
          their <code>running</code> phase, until your grade is posted.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <>
          <form
            onSubmit={submit}
            className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
          >
            <h2 className="text-sm font-semibold text-white">Write a review</h2>
            {msg && <p className="text-sm text-amber-300">{msg}</p>}
            {ok && <p className="text-sm text-emerald-300">{ok}</p>}

            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">Class</span>
              <select
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                disabled={eligible.length === 0}
              >
                {eligible.length === 0 ? (
                  <option value="">No classes eligible right now</option>
                ) : (
                  eligible.map((r) => (
                    <option key={r.class_id} value={r.class_id}>
                      {r.course_code} · {r.title}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">Stars</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setStars(n)}
                    className={`rounded border px-2 py-1 text-xs ${
                      stars >= n
                        ? 'border-amber-500 bg-amber-900/40 text-amber-200'
                        : 'border-zinc-700 text-zinc-500 hover:bg-zinc-800'
                    }`}
                    disabled={eligible.length === 0}
                  >
                    ★
                  </button>
                ))}
              </div>
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">Review</span>
              <textarea
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What was the class like? Be honest and respectful."
                disabled={eligible.length === 0}
              />
            </label>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting || eligible.length === 0 || !target || !body.trim()}
                className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                {submitting ? 'Submitting…' : 'Submit review'}
              </button>
            </div>
          </form>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-white">My current classes</h2>
            {reviewable.length === 0 ? (
              <p className="text-sm text-zinc-500">You are not enrolled in any classes.</p>
            ) : (
              <ul className="space-y-2">
                {reviewable.map((r) => {
                  const status: string =
                    r.grade !== null
                      ? `Locked — grade ${r.grade} posted`
                      : r.alreadyReviewed
                        ? 'Already reviewed'
                        : r.phase !== 'running'
                          ? `Available during class running phase (currently ${r.phase})`
                          : 'Eligible'
                  const tone =
                    status === 'Eligible'
                      ? 'text-emerald-300'
                      : status === 'Already reviewed'
                        ? 'text-zinc-400'
                        : 'text-amber-300'
                  return (
                    <li
                      key={r.enrollment_id}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm"
                    >
                      <span className="text-white">
                        {r.course_code} · {r.title}
                      </span>
                      <span className={`text-xs ${tone}`}>{status}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-white">My past reviews</h2>
            {myReviews.length === 0 ? (
              <p className="text-sm text-zinc-500">You haven't submitted any reviews yet.</p>
            ) : (
              <ul className="space-y-2">
                {myReviews.map((r) => (
                  <li
                    key={r.id}
                    className="rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>
                        {'★'.repeat(r.stars)}
                        {'☆'.repeat(5 - r.stars)}
                      </span>
                      <span>
                        {new Date(r.created_at).toLocaleDateString()}
                        {r.is_hidden && <span className="ml-2 text-amber-300">hidden</span>}
                      </span>
                    </div>
                    <p className="mt-1 text-zinc-200">
                      {r.is_hidden
                        ? 'This review was not published (3+ taboo list matches). Two warnings were recorded.'
                        : (r.filtered_body ?? r.body)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
