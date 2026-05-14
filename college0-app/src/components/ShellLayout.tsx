import { Link, NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuth, useRole } from '../hooks/useAuth'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1.5 text-sm ${isActive ? 'bg-indigo-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`

export function ShellLayout() {
  const { user, profile, signOut } = useAuth()
  const role = useRole()
  const loc = useLocation()

  if (user && profile?.first_login && loc.pathname !== '/first-login') {
    return <Navigate to="/first-login" replace />
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight text-white">
            College0
          </Link>
          <nav className="flex flex-wrap items-center gap-2">
            <NavLink to="/" className={linkClass} end>
              Home
            </NavLink>
            <NavLink to="/class-locations" className={linkClass}>
              Course map
            </NavLink>
            {!user && (
              <>
                <NavLink to="/apply/student" className={linkClass}>
                  Apply as student
                </NavLink>
                <NavLink to="/apply/instructor" className={linkClass}>
                  Apply as instructor
                </NavLink>
                <NavLink to="/ai" className={linkClass}>
                  Ask AI
                </NavLink>
                <NavLink to="/login" className={linkClass}>
                  Log in
                </NavLink>
              </>
            )}
            {user && (
              <NavLink to="/account" className={linkClass}>
                Account
              </NavLink>
            )}
            {role === 'registrar' && (
              <NavLink to="/registrar" className={linkClass}>
                Registrar
              </NavLink>
            )}
            {role === 'instructor' && (
              <NavLink to="/instructor" className={linkClass}>
                Instructor
              </NavLink>
            )}
            {role === 'student' && (
              <NavLink to="/student" className={linkClass}>
                Student
              </NavLink>
            )}
            {role === 'visitor' && (
              <NavLink to="/visitor" className={linkClass}>
                Directory
              </NavLink>
            )}
            {user && (
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
              >
                Sign out
              </button>
            )}
          </nav>
          {user && profile && (
            <div className="w-full text-right text-xs text-zinc-500 sm:w-auto">
              {profile.full_name} · {profile.role}
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-zinc-800 py-4 text-center text-xs text-zinc-600">
        College0 · AI-enabled program management (demo)
      </footer>
    </div>
  )
}
