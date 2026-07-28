'use client'

import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'

const PAGE_TITLES: Record<string, string> = {
  '/overview': 'Executive Overview',
  '/workforce': 'Workforce',
  '/attrition': 'Attrition & Retention',
  '/compensation': 'Compensation',
  '/recruiting': 'Recruiting',
  '/engagement': 'Engagement',
  '/wizard': 'Wizard',
  '/methodology': 'Methodology',
  '/upload': 'Data upload',
}

function titleFor(pathname: string | null): string {
  if (!pathname || pathname === '/') return PAGE_TITLES['/overview']
  const match = Object.keys(PAGE_TITLES).find(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
  return match ? PAGE_TITLES[match] : 'Meridian'
}

export function Topbar() {
  const pathname = usePathname()
  const title = titleFor(pathname)

  return (
    <header className="topbar">
      <div className="page-title">{title}</div>

      <div className="topbar-controls">
        <button type="button" className="topbar-chip" aria-label="Period selector">
          <span>TTM</span>
          <span aria-hidden="true">▾</span>
        </button>

        <button
          type="button"
          className="topbar-chip"
          aria-label="Toggle comparison mode"
          aria-pressed="false"
        >
          <span>vs. prior period</span>
        </button>

        <div
          className="topbar-chip"
          title="Reads from data_loads on Day 1"
          aria-label="Data freshness"
        >
          <span className="freshness-dot" aria-hidden="true" />
          <span>Mock data · no load yet</span>
        </div>

        <ThemeToggle />
      </div>
    </header>
  )
}
