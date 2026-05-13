import { NavLink, Outlet } from 'react-router-dom'

type NavItem = { to: string; label: string; end?: boolean }
type NavSection = { heading: string; items: NavItem[] }

const sections: NavSection[] = [
  {
    heading: 'Teaching',
    items: [
      { to: '/instructor', label: 'My classes', end: true },
      { to: '/instructor/waitlist', label: 'Waitlist management' },
      { to: '/instructor/grading', label: 'Grading' },
    ],
  },
  {
    heading: 'Feedback',
    items: [
      { to: '/instructor/reviews', label: 'Reviews' },
      { to: '/instructor/complaints', label: 'Complaints' },
    ],
  },
  {
    heading: 'Account',
    items: [
      { to: '/instructor/profile', label: 'My profile' },
      { to: '/instructor/ai', label: 'AI assistant' },
    ],
  },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded px-3 py-1.5 text-sm transition-colors ${
    isActive ? 'bg-indigo-600 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
  }`

export function InstructorLayout() {
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside className="md:w-60 md:shrink-0">
        <nav className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          {sections.map((section) => (
            <div key={section.heading} className="space-y-1">
              <div className="px-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {section.heading}
              </div>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} end={item.end} className={linkClass}>
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
