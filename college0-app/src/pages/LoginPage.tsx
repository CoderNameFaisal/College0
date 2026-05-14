import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { RedirectIfAuthed } from '../components/RequireRole'
import { CcnySprite } from '../components/CcnySprite'

export function LoginPage() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) setError(err.message)
      else nav('/')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-white/15 bg-black/25 px-3.5 py-2.5 text-white shadow-inner placeholder:text-zinc-500 focus:border-[var(--ccny-gold)] focus:outline-none focus:ring-2 focus:ring-[var(--ccny-gold)]/40'

  return (
    <RedirectIfAuthed>
      <div className="login-ccny -mx-4 -mt-8 -mb-8 flex min-h-[calc(100vh-5.5rem)] flex-col overflow-hidden rounded-none border-y border-white/5 bg-[#140a1f] lg:-mx-[max(0px,calc(50vw-36rem))] lg:mt-0 lg:mb-0 lg:min-h-[calc(100vh-8rem)] lg:max-w-[min(100vw,72rem)] lg:flex-row lg:border lg:border-white/10 lg:rounded-xl">
        {/* Brand column */}
        <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#3d1f5c] via-[#2a1240] to-[#120818] px-8 py-10 lg:max-w-[46%] lg:py-12">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage: `repeating-linear-gradient(
                -12deg,
                transparent,
                transparent 24px,
                rgba(201, 162, 39, 0.08) 24px,
                rgba(201, 162, 39, 0.08) 25px
              )`,
            }}
          />
          <div className="pointer-events-none absolute -right-8 top-6 text-[#c9a227]/25">
            <CcnySprite id="ccny-gothic-arch" className="h-40 w-28" />
          </div>
          <div className="pointer-events-none absolute bottom-10 left-4 text-white/20">
            <CcnySprite id="ccny-towers" className="h-24 w-32" />
          </div>
          <div className="pointer-events-none absolute right-12 top-1/3 text-[#c9a227]/30">
            <CcnySprite id="ccny-torch" className="h-20 w-12 rotate-12" />
          </div>
          <div className="pointer-events-none absolute left-1/3 top-20 text-white/15">
            <CcnySprite id="ccny-book" className="h-14 w-20 -rotate-6" />
          </div>
          <div className="pointer-events-none absolute bottom-24 right-1/4 text-[#c9a227]/20">
            <CcnySprite id="ccny-paw" className="h-12 w-12 opacity-90" />
          </div>

          <header className="relative z-[1]">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#c9a227]/40 bg-black/30 text-[#c9a227] shadow-lg">
                <CcnySprite id="ccny-gothic-arch" className="h-8 w-6" title="CCNY-inspired mark" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d4b54a]">
                  The City College of New York
                </p>
                <h1 className="font-serif text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  College0
                </h1>
              </div>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-violet-100/85">
              Sign in to course enrollment, AI study tools, and program management for the CCNY demo environment.
            </p>
          </header>

          <footer className="relative z-[1] mt-10 lg:mt-0">
            <CcnySprite id="ccny-stone-band" className="mb-4 h-6 w-full max-w-[220px] text-[#c9a227]/50" />
            <p className="text-xs text-violet-200/55">138th &amp; Convent · Hamilton Heights</p>
          </footer>
        </div>

        {/* Form column */}
        <div className="relative flex flex-1 items-center justify-center bg-[#0c0712]/95 px-6 py-12 lg:px-12">
          <div className="pointer-events-none absolute top-8 right-8 hidden text-white/10 sm:block">
            <CcnySprite id="ccny-book" className="h-16 w-24" />
          </div>
          <div className="relative z-[1] w-full max-w-[380px] space-y-6">
            <div>
              <h2 className="font-serif text-xl font-semibold text-white sm:text-2xl">Welcome back</h2>
              <p className="mt-1 text-sm text-zinc-400">Use your CCNY program credentials.</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">Email</span>
                <input
                  className={inputClass}
                  type="email"
                  autoComplete="email"
                  placeholder="you@ccny.cuny.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">Password</span>
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              {error && (
                <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#5b2d82] to-[#4a2468] py-3 text-sm font-semibold text-white shadow-lg shadow-purple-950/50 transition hover:from-[#6d3798] hover:to-[#5b2d82] focus:outline-none focus:ring-2 focus:ring-[#c9a227]/60 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                      aria-hidden
                    />
                    Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>

            <p className="border-t border-white/10 pt-4 text-xs text-zinc-500">
              Accounts are not self-registered here. Use <strong className="text-zinc-400">Apply as a student</strong> or{' '}
              <strong className="text-zinc-400">Apply as an instructor</strong> on the home page; the registrar creates logins
              when an application is accepted.
            </p>
          </div>
        </div>
      </div>
    </RedirectIfAuthed>
  )
}
