'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { MetricChart } from '@/components/charts/MetricChart'
import { DetailTableView } from '@/components/shell/DetailTableView'
import {
  peekCachedBundle,
  useMetricsCache,
} from '@/components/shell/MetricsCacheProvider'
import { useFiltersOptional } from '@/components/shell/FilterProvider'
import { SourceLine } from '@/components/shell/SourceLine'
import {
  EMPTY_FILTER_CONTEXT,
  type ChartPayload,
  type DataFreshness,
  type DetailTable,
  type PageVisualBundle,
} from '@/lib/types'

type KpiView = {
  id: string
  label: string
  value: string
  delta: string
  polarity: 'good' | 'bad' | 'neutral'
  methodologyId: string
}

type Props = {
  endpoint: string
  title: string
  sourceTables?: string[]
}

function formatKpi(id: string, value: number, format?: string, unit?: string): string {
  if (!Number.isFinite(value)) return '—'
  switch (format) {
    case 'rate':
      return `${value.toFixed(1)}${unit ?? '%'}`
    case 'score':
    case 'ratio':
      return unit ? `${value.toFixed(2)} ${unit}` : value.toFixed(2)
    case 'days':
      return `${value.toFixed(0)}d`
    default:
      if (id.includes('attrition') && id.includes('rate')) {
        return `${value.toFixed(1)}%`
      }
      return Number.isInteger(value)
        ? value.toLocaleString()
        : value.toLocaleString(undefined, { maximumFractionDigits: 1 })
  }
}

function deltaLabel(
  delta: PageVisualBundle['kpis'][number]['delta'],
): { text: string; polarity: 'good' | 'bad' | 'neutral' } {
  if (!delta) return { text: '', polarity: 'neutral' }
  if (delta.direction === 'flat') return { text: 'flat', polarity: 'neutral' }
  const sign = delta.absolute > 0 ? '+' : ''
  const text =
    delta.relative != null
      ? `${sign}${delta.absolute} (${sign}${delta.relative}% vs. prior)`
      : `${sign}${delta.absolute} vs. prior`
  if (delta.polarity === 'higher_is_better') {
    return { text, polarity: delta.direction === 'up' ? 'good' : 'bad' }
  }
  if (delta.polarity === 'lower_is_better') {
    return { text, polarity: delta.direction === 'down' ? 'good' : 'bad' }
  }
  return { text, polarity: 'neutral' }
}

function toKpis(bundle: PageVisualBundle): KpiView[] {
  return bundle.kpis.map((k) => {
    const d = deltaLabel(k.delta)
    return {
      id: k.id,
      label: k.label,
      value: formatKpi(k.id, Number(k.value), k.format, k.unit),
      delta: d.text,
      polarity: d.polarity,
      methodologyId: k.methodologyId,
    }
  })
}

export function MetricsPageClient({ endpoint, title, sourceTables }: Props) {
  const { getBundle } = useMetricsCache()
  const filters = useFiltersOptional()?.filters ?? EMPTY_FILTER_CONTEXT
  const cached = peekCachedBundle(endpoint, filters)
  const [kpis, setKpis] = useState<KpiView[] | null>(
    cached ? toKpis(cached) : null,
  )
  const [charts, setCharts] = useState<ChartPayload[] | null>(
    cached ? cached.charts ?? [] : null,
  )
  const [table, setTable] = useState<DetailTable | null>(cached?.table ?? null)
  const [freshness, setFreshness] = useState<DataFreshness | null>(
    cached?.freshness ?? null,
  )
  const [error, setError] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(Boolean(cached))

  const filterKey = useMemo(() => JSON.stringify(filters), [filters])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setError(null)
        const { bundle, fromCache: hit } = await getBundle(endpoint, filters)
        if (cancelled) return
        setKpis(toKpis(bundle))
        setCharts(bundle.charts ?? [])
        setTable(bundle.table ?? null)
        setFreshness(bundle.freshness)
        setFromCache(hit)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load metrics')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [endpoint, getBundle, filterKey, filters])

  const tiles: KpiView[] =
    kpis ??
    Array.from({ length: 4 }, (_, i) => ({
      id: `skeleton-${i}`,
      label: 'Loading…',
      value: '…',
      delta: '',
      polarity: 'neutral' as const,
      methodologyId: '',
    }))

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="kpi-row" aria-label={`${title} KPIs`}>
        {tiles.map((k) => (
          <article key={k.id} className="kpi-tile">
            <span className="kpi-label">{k.label}</span>
            <span className="kpi-value">{k.value}</span>
            {k.delta ? (
              <span className="kpi-delta" data-polarity={k.polarity}>
                {k.delta}
              </span>
            ) : null}
            {k.methodologyId ? (
              <Link
                className="methodology-link"
                href={`/methodology#${k.methodologyId}`}
              >
                Definition
              </Link>
            ) : null}
          </article>
        ))}
      </section>

      <SourceLine freshness={freshness} tables={sourceTables} />

      {fromCache && (
        <p className="cache-hint" aria-live="polite">
          Showing cached metrics for the current upload and filters
        </p>
      )}

      <section className="chart-grid" aria-label={`${title} charts`}>
        {(charts ?? []).length === 0 && kpis && (
          <article className="card chart-card">
            <h3 className="card-title">{title} charts</h3>
            <p className="card-subtitle">
              No chart series for this page yet — KPIs above are live from the
              current upload.
            </p>
            <SourceLine freshness={freshness} tables={sourceTables} />
          </article>
        )}
        {(charts ?? []).map((chart) => (
          <MetricChart
            key={chart.id}
            chart={chart}
            freshness={freshness}
            sourceTables={sourceTables}
          />
        ))}
      </section>

      {table ? <DetailTableView table={table} /> : null}
    </>
  )
}
