'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'
import { useMetricsCache } from './MetricsCacheProvider'
import { useFilters } from './FilterProvider'
import type { ComparisonMode, DataFreshness, PeriodGrain } from '@/lib/types'

const PAGE_TITLES: Record<string, string> = {
  '/overview': 'Executive Overview',
  '/workforce': 'Workforce',
  '/attrition': 'Attrition & Retention',
  '/compensation': 'Compensation',
  '/recruiting': 'Recruiting',
  '/engagement': 'Engagement',
  '/wizard': 'Wizard',
  '/methodology': 'Methodology',
  '/admin/upload': 'Data upload',
  '/drill': 'Drill-through',
}

function titleFor(pathname: string | null): string {
  if (!pathname || pathname === '/') return PAGE_TITLES['/overview']
  const match = Object.keys(PAGE_TITLES).find(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
  return match ? PAGE_TITLES[match] : 'Meridian'
}

function freshnessLabel(freshness: DataFreshness | null): string {
  if (!freshness) return 'Checking data…'
  if (!freshness.lastLoadedAt) return freshness.sourceSummary || 'No load yet'
  const when = new Date(freshness.lastLoadedAt).toLocaleString()
  return freshness.sourceSummary
    ? `${freshness.sourceSummary} · ${when}`
    : when
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
  const {
    filters,
    setComparison,
    setPeriodGrain,
    copyViewLink,
  } = useFilters()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void ensureFreshness().catch(() => undefined)
  }, [ensureFreshness, pathname])

  const live = Boolean(freshness?.lastLoadedAt)
  const asOf = freshness?.asOfDate

  return (
    <header className="topbar">
      <div className="page-title-block">
        <div className="page-title">{title}</div>
        {asOf ? (
          <div className="page-asof">As of {asOf}</div>
        ) : null}
      </div>

      <div className="topbar-controls">
        <label className="topbar-chip topbar-select-wrap">
          <span className="sr-only">Period grain</span>
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
          <span className="sr-only">Comparison mode</span>
          <select
            className="topbar-select"
            value={filters.comparison}
            onChange={(e) => setComparison(e.target.value as ComparisonMode)}
            aria-label="Comparison mode"
            aria-pressed={filters.comparison !== 'none'}
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

        <div
          className="topbar-chip"
          title="Cached until the next data upload"
          aria-label="Data freshness"
        >
          <span
            className="freshness-dot"
            data-live={live ? 'true' : 'false'}
            aria-hidden="true"
          />
          <span>{freshnessLabel(freshness)}</span>
        </div>

        <ThemeToggle />
      </div>
    </header>
  )
}
