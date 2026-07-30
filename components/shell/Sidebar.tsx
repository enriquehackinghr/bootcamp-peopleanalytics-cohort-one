'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSessionOptional } from '@/components/shell/SessionProvider'
import type { AppRole } from '@/lib/auth/types'

type NavLink = {
  href: string
  label: string
  icon: string
  roles?: AppRole[]
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
      {
        href: '/advanced-analytics',
        label: 'Advanced Analytics',
        icon: 'M4 19V5m0 14h16M8 15l3-4 3 2 4-6',
      },
      {
        href: '/workforce-planning',
        label: 'Workforce Planning',
        icon: 'M4 19h16M6 16V9m4 7V5m4 11v-6m4 6V7',
      },
      {
        href: '/customized-reports',
        label: 'Customized Reports',
        icon: 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h4',
      },
    ],
  },
  {
    label: 'People',
    items: [
      {
        href: '/find-employees',
        label: 'My Team',
        icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm12 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
        roles: ['admin', 'executive', 'manager'],
      },
      {
        href: '/org-chart',
        label: 'Org chart',
        icon: 'M12 3v4M6 21v-6a2 2 0 012-2h8a2 2 0 012 2v6M9 11V9a3 3 0 016 0v2',
        roles: ['admin', 'executive', 'manager'],
      },
    ],
  },
  {
    label: 'Explore',
    items: [
      { href: '/methodology', label: 'Methodology', icon: 'M4 4h16v4H4zM4 12h16v4H4zM4 20h10v0' },
      {
        href: '/wizard-eval',
        label: 'Wizard eval',
        icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
        roles: ['admin', 'executive'],
      },
    ],
  },
  {
    label: 'Admin',
    items: [
      {
        href: '/admin/upload',
        label: 'Data upload',
        icon: 'M12 3v12m0 0l-4-4m4 4l4-4M5 21h14',
        roles: ['admin'],
      },
      {
        href: '/audit',
        label: 'Audit log',
        icon: 'M4 6h16M4 12h16M4 18h10',
        roles: ['admin'],
      },
    ],
  },
]

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === '/overview') return pathname === '/' || pathname.startsWith('/overview')
  return pathname === href || pathname.startsWith(`${href}/`)
}

function labelForFinder(role: AppRole | undefined): string {
  if (role === 'manager') return 'My Team'
  return 'All Employees'
}

export function Sidebar() {
  const pathname = usePathname()
  const session = useSessionOptional()?.session
  const role = session?.appRole

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.25" />
            <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="1.25" />
            <circle cx="12" cy="12" r="2.25" fill="currentColor" />
          </svg>
        </span>
        <div className="brand-copy">
          <span className="brand-name">Meridian</span>
          <span className="brand-tag">People survey</span>
        </div>
      </div>

      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => {
          if (!item.roles) return true
          if (!role) return false
          return item.roles.includes(role)
        })
        if (items.length === 0) return null
        return (
          <div key={group.label}>
            <div className="nav-section-label">{group.label}</div>
            <nav className="nav" aria-label={group.label}>
              {items.map((item) => {
                const active = isActive(pathname, item.href)
                const label =
                  item.href === '/find-employees' ? labelForFinder(role) : item.label
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
                    <span>{label}</span>
                  </Link>
                )
              })}
            </nav>
          </div>
        )
      })}
    </aside>
  )
}
