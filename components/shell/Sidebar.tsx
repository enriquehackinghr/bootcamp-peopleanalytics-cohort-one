'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavLink = {
  href: string
  label: string
  icon: string
}

type NavGroup = {
  label: string
  items: NavLink[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Analytics',
    items: [
      { href: '/overview', label: 'Executive Overview', icon: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10' },
      { href: '/workforce', label: 'Workforce', icon: 'M8 11a4 4 0 100-8 4 4 0 000 8zm8 0a3 3 0 100-6 3 3 0 000 6zm-8 2a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zm8 0a5 5 0 00-2.6.72A7 7 0 0116 19v1h6v-1a6 6 0 00-6-6z' },
      { href: '/attrition', label: 'Attrition & Retention', icon: 'M3 17l6-6 4 4 8-8M17 7h4v4' },
      { href: '/compensation', label: 'Compensation', icon: 'M12 3v18M7 7h7a3 3 0 010 6H10a3 3 0 000 6h8' },
      { href: '/recruiting', label: 'Recruiting', icon: 'M4 5h16M4 12h10M4 19h6M18 15l3 3-3 3M21 18h-7' },
      { href: '/engagement', label: 'Engagement', icon: 'M12 21s-8-5.7-8-12a5 5 0 019-3 5 5 0 019 3c0 6.3-8 12-8 12z' },
    ],
  },
  {
    label: 'Explore',
    items: [
      { href: '/wizard', label: 'Wizard', icon: 'M12 2l2.4 5 5.6.8-4 3.9.9 5.6L12 15l-4.9 2.3.9-5.6L4 7.8 9.6 7z' },
      { href: '/methodology', label: 'Methodology', icon: 'M4 4h16v4H4zM4 12h16v4H4zM4 20h10v0' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/upload', label: 'Data upload', icon: 'M12 3v12m0 0l-4-4m4 4l4-4M5 21h14' },
    ],
  },
]

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === '/overview') return pathname === '/' || pathname.startsWith('/overview')
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">Meridian</span>
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="nav-section-label">{group.label}</div>
          <nav className="nav" aria-label={group.label}>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-item"
                  aria-current={active ? 'page' : undefined}
                >
                  <svg
                    className="nav-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={item.icon} />
                  </svg>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      ))}
    </aside>
  )
}
