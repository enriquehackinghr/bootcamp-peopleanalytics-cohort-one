'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { MetricChart } from '@/components/charts/MetricChart'
import { DetailTableView } from '@/components/shell/DetailTableView'
import { useFiltersOptional } from '@/components/shell/FilterProvider'
import { SourceLine } from '@/components/shell/SourceLine'
import {
  EMPTY_FILTER_CONTEXT,
  type AdvancedAnalyticsResponse,
  type ChartPayload,
  type InvestigationGuidance,
  type KpiTile,
} from '@/lib/types'

const SECTIONS = [
  { id: 'attrition-patterns', label: 'Attrition patterns' },
  { id: 'retention-drivers', label: 'Retention drivers' },
  { id: 'org-events', label: 'Organizational events' },
  { id: 'exit-themes', label: 'Exit-interview themes' },
  { id: 'risk-indicators', label: 'Risk indicators' },
  { id: 'backtest', label: 'Backtest and lift' },
  { id: 'manager-effectiveness', label: 'Manager effectiveness' },
  { id: 'talent-readiness', label: 'Talent and readiness' },
  { id: 'methodology', label: 'Methodology' },
  { id: 'guidance', label: 'Investigation guidance' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

const SECTION_CHART_PREFIX: Record<string, string[]> = {
  'attrition-patterns': [
    'attrition_over_time',
    'attrition_by_cut',
    'tenure_hazard',
    'cohort_survival',
  ],
  'retention-drivers': [
    'exit_rate_by_compa_band',
    'exit_rate_by_engagement_band',
    'exit_rate_by_mobility_gap',
    'exit_rate_by_manager_quartile',
    'exit_rate_by_tenure_band',
  ],
  'org-events': [
    'attrition_around_manager_change',
    'attrition_after_reorg',
    'retention_after_location_change',
  ],
  'exit-themes': ['exit_driver_frequency', 'exit_themes', 'exit_contradictions'],
  'risk-indicators': [
    'risk_band_distribution',
    'risk_factor_contribution',
    'risk_by_cohort',
    'data_sufficiency_summary',
  ],
  backtest: ['risk_backtest_lift'],
  'manager-effectiveness': [
    'manager_effectiveness_scatter',
    'manager_components',
  ],
  'talent-readiness': [
    'rating_distribution',
    'calibration_outliers',
    'nine_box_migration',
    'promotion_pipeline',
    'readiness_distribution',
    'bench_coverage',
  ],
}

function formatKpi(kpi: KpiTile): string {
  if (!Number.isFinite(kpi.value)) return '—'
  switch (kpi.format) {
    case 'rate':
      return `${kpi.value.toFixed(1)}${kpi.unit ?? '%'}`
    case 'score':
    case 'ratio':
      return kpi.unit ? `${kpi.value.toFixed(2)} ${kpi.unit}` : kpi.value.toFixed(2)
    default:
      return Number.isInteger(kpi.value)
        ? kpi.value.toLocaleString()
        : kpi.value.toLocaleString(undefined, { maximumFractionDigits: 1 })
  }
}

function chartsForSection(
  charts: ChartPayload[],
  sectionId: string,
): ChartPayload[] {
  const prefixes = SECTION_CHART_PREFIX[sectionId]
  if (!prefixes) return []
  return charts.filter((c) => prefixes.some((p) => c.id === p || c.id.startsWith(p)))
}

export function AdvancedAnalyticsClient() {
  const filters = useFiltersOptional()?.filters ?? EMPTY_FILTER_CONTEXT
  const filterKey = useMemo(() => JSON.stringify(filters), [filters])
  const [data, setData] = useState<AdvancedAnalyticsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SectionId>('attrition-patterns')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setError(null)
        const res = await fetch('/api/metrics/advanced-analytics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const json = (await res.json()) as AdvancedAnalyticsResponse
        if (!cancelled) setData(json)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load advanced analytics')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [filterKey, filters])

  const charts = data?.charts ?? []
  const guidance = data?.guidance ?? []
  const sectionCharts = chartsForSection(charts, activeTab)
  const showManagerTable =
    activeTab === 'manager-effectiveness' && Boolean(data?.table?.rows?.length)

  return (
    <>
      <header className="page-header">
        <p className="eyebrow">Class 3</p>
        <h1 className="page-title">Advanced Analytics</h1>
        <p className="lede">
          Historical attrition, transparent retention-risk indicators, manager
          effectiveness, and talent readiness — association language only; no
          fitted model.
        </p>
      </header>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="kpi-row" aria-label="Advanced analytics KPIs">
        {(data?.kpis ?? Array.from({ length: 6 }, (_, i) => null)).map((kpi, i) =>
          kpi ? (
            <article key={kpi.id} className="kpi-tile">
              <span className="kpi-label">{kpi.label}</span>
              <span className="kpi-value">{formatKpi(kpi)}</span>
              {kpi.methodologyId ? (
                <Link className="methodology-link" href={`/methodology#${kpi.methodologyId}`}>
                  Definition
                </Link>
              ) : null}
            </article>
          ) : (
            <article key={`sk-${i}`} className="kpi-tile">
              <span className="kpi-label">Loading…</span>
              <span className="kpi-value">…</span>
            </article>
          ),
        )}
      </section>

      <SourceLine
        freshness={data?.freshness}
        tables={[
          'employee_snapshots',
          'termination_history',
          'engagement_score_history',
          'org_events',
          'exit_interviews',
        ]}
      />

      <div className="aa-tabs" role="tablist" aria-label="Advanced analytics sections">
        {SECTIONS.map((s) => {
          const selected = activeTab === s.id
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`aa-tab-${s.id}`}
              aria-selected={selected}
              aria-controls={`aa-panel-${s.id}`}
              className={`aa-tab${selected ? ' aa-tab--active' : ''}`}
              onClick={() => setActiveTab(s.id)}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      <div
        className="aa-tab-panel"
        role="tabpanel"
        id={`aa-panel-${activeTab}`}
        aria-labelledby={`aa-tab-${activeTab}`}
      >
        {activeTab === 'methodology' ? (
          <MethodologyPanel panel={data?.methodologyPanel} />
        ) : activeTab === 'guidance' ? (
          <div className="guidance-grid">
            {guidance.length ? (
              guidance.map((g, i) => <GuidanceCard key={i} guidance={g} />)
            ) : (
              <article className="card">
                <p className="card-subtitle">No investigation guidance for this filter set.</p>
              </article>
            )}
          </div>
        ) : (
          <>
            <div className="chart-grid">
              {sectionCharts.map((chart) => (
                <MetricChart
                  key={chart.id}
                  chart={chart}
                  freshness={data?.freshness}
                  sourceTables={[
                    'employee_snapshots',
                    'termination_history',
                    'org_events',
                    'exit_interviews',
                  ]}
                />
              ))}
              {sectionCharts.length === 0 && data ? (
                <article className="card chart-card">
                  <h3 className="card-title">
                    {SECTIONS.find((s) => s.id === activeTab)?.label}
                  </h3>
                  <p className="card-subtitle">
                    No chart series for this tab yet. Confirm Class 3 datasets are
                    loaded and semantic RPCs are migrated.
                  </p>
                </article>
              ) : null}
            </div>
            {showManagerTable && data?.table ? (
              <DetailTableView table={data.table} />
            ) : null}
          </>
        )}
      </div>
    </>
  )
}

function GuidanceCard({ guidance }: { guidance: InvestigationGuidance }) {
  return (
    <article className="card guidance-card">
      <h3 className="card-title">{guidance.signal}</h3>
      <p className="card-subtitle">
        {guidance.scope} · {guidance.period}
      </p>
      {guidance.comparison ? <p>{guidance.comparison}</p> : null}
      {guidance.data_limitations ? (
        <p className="aa-caveat">{guidance.data_limitations}</p>
      ) : null}
      <ul>
        {guidance.suggested_next_analysis.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p className="aa-caveat">{guidance.responsible_use_note}</p>
    </article>
  )
}

function MethodologyPanel({
  panel,
}: {
  panel?: AdvancedAnalyticsResponse['methodologyPanel']
}) {
  if (!panel) {
    return (
      <article className="card">
        <p className="card-subtitle">
          Methodology panel loads with Class 3 semantic layer (risk-v0.2). Weights
          are declared and published — no fitted model.
        </p>
      </article>
    )
  }
  return (
    <article className="card methodology-panel">
      <p>
        <strong>Version:</strong> {panel.methodologyVersion} · weights{' '}
        {panel.factorWeightVersion} · bands {panel.bandThresholdVersion}
      </p>
      <p className="aa-caveat">{panel.responsibleUse}</p>
      <table className="detail-table">
        <thead>
          <tr>
            <th>Factor</th>
            <th>Calibrated</th>
            <th>Published</th>
          </tr>
        </thead>
        <tbody>
          {(panel.weights ?? []).map((w) => (
            <tr key={w.factor}>
              <td>{w.factor}</td>
              <td>{w.calibrated}</td>
              <td>{w.published}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Bands: Low {panel.bands?.low} · Moderate {panel.bands?.moderate} · Elevated{' '}
        {panel.bands?.elevated} · High {panel.bands?.high}
      </p>
      <p>
        Cell sizes: manager/talent n≥{panel.minCellManager}; hazard/survival n≥
        {panel.minCellHazard} (rate stability).
      </p>
      {panel.backtestSummary ? <p>{panel.backtestSummary}</p> : null}
    </article>
  )
}
