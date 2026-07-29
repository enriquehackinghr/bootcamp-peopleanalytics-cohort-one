'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { MetricChart } from '@/components/charts/MetricChart'
import { DetailTableView } from '@/components/shell/DetailTableView'
import { useFiltersOptional } from '@/components/shell/FilterProvider'
import { SourceLine } from '@/components/shell/SourceLine'
import {
  EMPTY_FILTER_CONTEXT,
  type ManagerDetailResponse,
} from '@/lib/types'

export function ManagerDetailClient() {
  const params = useParams<{ managerId: string }>()
  const managerId = params.managerId
  const filters = useFiltersOptional()?.filters ?? EMPTY_FILTER_CONTEXT
  const filterKey = useMemo(() => JSON.stringify(filters), [filters])
  const [data, setData] = useState<ManagerDetailResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setError(null)
        const res = await fetch(`/api/metrics/managers/${encodeURIComponent(managerId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const json = (await res.json()) as ManagerDetailResponse
        if (!cancelled) setData(json)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load manager view')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [managerId, filterKey, filters])

  return (
    <>
      <header className="page-header">
        <p className="eyebrow">Limited drill-through</p>
        <h1 className="page-title">Manager {managerId}</h1>
        <p className="lede">
          Analytical context for a manager&apos;s team — not a full manager
          product. Risk is shown by cohort only, never as a ranked list of
          individuals.
        </p>
        <p>
          <Link href="/advanced-analytics">← Advanced Analytics</Link>
        </p>
      </header>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {data?.suppressed ? (
        <article className="card">
          <h2 className="card-title">Team below minimum cell size</h2>
          <p className="card-subtitle">
            {data.suppressionReason ||
              'Teams with fewer than 5 members are excluded from manager analytics (n ≥ 5).'}
          </p>
          <p>Team size: {data.teamSize}</p>
        </article>
      ) : (
        <>
          <section className="kpi-row" aria-label="Manager KPIs">
            {(data?.kpis ?? []).map((kpi) => (
              <article key={kpi.id} className="kpi-tile">
                <span className="kpi-label">{kpi.label}</span>
                <span className="kpi-value">
                  {kpi.format === 'rate'
                    ? `${kpi.value.toFixed(1)}%`
                    : kpi.value.toLocaleString()}
                </span>
              </article>
            ))}
          </section>
          {data?.peerBasis ? (
            <p className="aa-caveat">Peer comparison basis: {data.peerBasis}</p>
          ) : null}
          <SourceLine freshness={data?.freshness} tables={['employee_snapshots', 'employees']} />
          <section className="chart-grid">
            {(data?.charts ?? []).map((chart) => (
              <MetricChart key={chart.id} chart={chart} freshness={data?.freshness} />
            ))}
          </section>
          {data?.table ? <DetailTableView table={data.table} /> : null}
        </>
      )}

      <p className="aa-caveat">
        {data?.responsibleUseNote ||
          'Investigation support only — not an employment decision about any person.'}
      </p>
    </>
  )
}
