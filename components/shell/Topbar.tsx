'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'
import { FontScaleControl } from './FontScaleControl'
import { useMetricsCache } from './MetricsCacheProvider'
import { useFilters } from './FilterProvider'
import { useSessionOptional } from './SessionProvider'
import type { ComparisonMode, DataFreshness, PeriodGrain } from '@/lib/types'

const PAGE_TITLES: Record<string, string> = {
  '/overview': 'Executive Overview',
  '/workforce': 'Workforce',
  '/attrition': 'Attrition & Retention',
  '/compensation': 'Compensation',
  '/recruiting': 'Recruiting',
  '/engagement': 'Engagement',
  '/advanced-analytics': 'Advanced Analytics',
  '/workforce-planning': 'Workforce Planning',
  '/customized-reports': 'Customized Reports',
  '/find-employees': 'Employee Finder',
  '/org-chart': 'Org chart',
  '/employees': 'Employee 360',
  '/wizard': 'Wizard',
  '/wizard-eval': 'Wizard evaluation',
  '/methodology': 'Methodology',
  '/admin/upload': 'Data upload',
  '/audit': 'Audit log',
  '/drill': 'Drill-through',
}

function titleFor(pathname: string | null): string {
  if (!pathname || pathname === '/') return PAGE_TITLES['/overview']
  const match = Object.keys(PAGE_TITLES).find(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
  return match ? PAGE_TITLES[match] : 'Meridian'
}

function formatShortWhen(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function freshnessSummary(freshness: DataFreshness | null): {
  compact: string
  files: { name: string; when: string }[]
} {
  if (!freshness) return { compact: 'Checking data…', files: [] }
  if (!freshness.lastLoadedAt) {
    return { compact: freshness.sourceSummary || 'No load yet', files: [] }
  }

  const files =
    freshness.sources?.length > 0
      ? freshness.sources.map((s) => ({
          name: s.fileName,
          when: formatShortWhen(s.loadedAt),
        }))
      : (freshness.sourceSummary ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((name) => ({ name, when: formatShortWhen(freshness.lastLoadedAt) }))

  const count = files.length
  const when = formatShortWhen(freshness.lastLoadedAt)
  const compact =
    count > 0
      ? `${count} source${count === 1 ? '' : 's'} · ${when}`
      : `Updated · ${when}`

  return { compact, files }
}

const COMPARISON_OPTIONS: { value: ComparisonMode; label: string }[] = [
  { value: 'none', label: 'No comparison' },
  { value: 'prior_period', label: 'vs. prior period' },
  { value: 'same_period_last_year', label: 'vs. same period LY' },
]

const GRAIN_OPTIONS: { value: PeriodGrain; label: string }[] = [
  { value: 'ttm', label: 'TTM' },
  { value: 'year', label: 'Year' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'month', label: 'Month' },
]

export function Topbar() {
  const pathname = usePathname()
  const title = titleFor(pathname)
  const { freshness, ensureFreshness } = useMetricsCache()
  const { filters, setComparison, setPeriodGrain, copyViewLink } = useFilters()
  const sessionCtx = useSessionOptional()
  const session = sessionCtx?.session
  const [copied, setCopied] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const sourcesRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    void ensureFreshness().catch(() => undefined)
  }, [ensureFreshness, pathname])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!sourcesRef.current?.contains(event.target as Node)) {
        setSourcesOpen(false)
        if (sourcesRef.current) sourcesRef.current.open = false
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const live = Boolean(freshness?.lastLoadedAt)
  const asOf = freshness?.asOfDate
  const summary = useMemo(() => freshnessSummary(freshness), [freshness])
  const grainLabel =
    GRAIN_OPTIONS.find((o) => o.value === filters.period.grain)?.label ?? 'TTM'
  const comparisonLabel =
    COMPARISON_OPTIONS.find((o) => o.value === filters.comparison)?.label ??
    'No comparison'

  const boundary = session?.reportingBoundary || asOf

  return (
    <header className="topbar">
      <div className="page-title-block">
        <h1 className="topbar-title">{title}</h1>
        {session ? (
          <p className="session-banner">
            Signed in as {session.fullName} · {session.appRole} · Viewing{' '}
            {session.visibleEmployeeCount.toLocaleString()} employees · Data as of{' '}
            {session.reportingBoundary}
          </p>
        ) : boundary ? (
          <p className="page-asof">As of {boundary}</p>
        ) : null}
      </div>

      <div className="topbar-controls">
        <label className="topbar-chip topbar-select-wrap">
          <span className="topbar-chip-label">{grainLabel}</span>
          <select
            className="topbar-select"
            value={filters.period.grain}
            onChange={(e) => setPeriodGrain(e.target.value as PeriodGrain)}
            aria-label="Period grain"
          >
            {GRAIN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="topbar-chip topbar-select-wrap">
          <span className="topbar-chip-label">{comparisonLabel}</span>
          <select
            className="topbar-select"
            value={filters.comparison}
            onChange={(e) => setComparison(e.target.value as ComparisonMode)}
            aria-label="Comparison mode"
          >
            {COMPARISON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="topbar-chip"
          onClick={async () => {
            await copyViewLink()
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
          }}
          title="Copy link to this view"
        >
          {copied ? 'Link copied' : 'Copy view link'}
        </button>

        <details
          ref={sourcesRef}
          className="topbar-sources"
          open={sourcesOpen}
          onToggle={(e) => setSourcesOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary
            className="topbar-chip topbar-sources-summary"
            title="Data load status — expand for source files"
            aria-label={`Data freshness: ${summary.compact}`}
          >
            <span
              className="freshness-dot"
              data-live={live ? 'true' : 'false'}
              aria-hidden="true"
            />
            <span className="topbar-sources-compact">{summary.compact}</span>
            <span className="topbar-sources-caret" aria-hidden="true">
              ▾
            </span>
          </summary>
          <div className="topbar-sources-panel" role="region" aria-label="Source files">
            <p className="topbar-sources-heading">Latest source files</p>
            {summary.files.length ? (
              <ul className="topbar-sources-list">
                {summary.files.map((file) => (
                  <li key={file.name}>
                    <span className="topbar-sources-name" title={file.name}>
                      {file.name}
                    </span>
                    <span className="topbar-sources-when">{file.when}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="topbar-sources-empty">No source files recorded yet.</p>
            )}
            <p className="topbar-sources-note">Cached until the next data upload.</p>
          </div>
        </details>

        <FontScaleControl />
        <ThemeToggle />
        {session ? (
          <button
            type="button"
            className="topbar-chip"
            onClick={() => void sessionCtx?.signOut()}
          >
            Sign out
          </button>
        ) : null}
      </div>
    </header>
  )
}
