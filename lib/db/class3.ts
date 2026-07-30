/**
 * Class 3 semantic layer — advanced analytics, attrition risk, manager
 * effectiveness, and talent surfaces. Mirrors the getServiceSupabase() +
 * rpc() style established in lib/db/metrics.ts.
 *
 * All numbers here come from `c3_*` / `attrition_risk_score` Postgres RPCs
 * (see supabase/migrations/20260729*_class3_*.sql) that read from
 * employee_snapshots, termination_history, engagement_score_history,
 * engagement_survey_waves, org_events, performance_reviews, and
 * exit_interviews. Every helper degrades to an empty-but-valid payload (with
 * emptyReason set) when the database is not configured or an RPC call
 * fails/is not yet deployed, so the UI never crashes waiting on the SQL side
 * of Class 3.
 *
 * Association language only — nothing here claims a fitted model or a
 * causal driver, and Employee 360 never surfaces gender or race.
 */
import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import { effectiveFilters, filtersToJson } from '@/lib/db/filters'
import { getFreshness } from '@/lib/db/metrics'
import type {
  AdvancedAnalyticsMethodologyPanel,
  AdvancedAnalyticsResponse,
  AttritionRiskScore,
  ChartForm,
  ChartPayload,
  ChartSeriesPoint,
  DetailTable,
  Employee360Response,
  FilterContext,
  InvestigationGuidance,
  KpiTile,
  ManagerDetailResponse,
  RiskFactorResult,
  RiskFactorStatus,
} from '@/lib/types'
import { MIN_CELL_SIZE, MIN_CELL_SIZE_HAZARD } from '@/lib/types'

// ---------------------------------------------------------------------------
// RPC helpers — graceful empty fallback whenever the DB or RPC is missing.
// ---------------------------------------------------------------------------

async function rpcNumber(
  fn: string,
  params: Record<string, unknown> = {},
): Promise<number | null> {
  if (!hasDatabaseConfig()) return null
  const supabase = getServiceSupabase()
  const { data, error } = await supabase.rpc(fn, params)
  if (error) {
    console.error(`rpc ${fn}`, error.message)
    return null
  }
  if (data === null || data === undefined) return null
  const n = Number(data)
  return Number.isFinite(n) ? n : null
}

async function rpcJson<T>(
  fn: string,
  params: Record<string, unknown>,
  fallback: T,
): Promise<T> {
  if (!hasDatabaseConfig()) return fallback
  const supabase = getServiceSupabase()
  const { data, error } = await supabase.rpc(fn, params)
  if (error) {
    console.error(`rpc ${fn}`, error.message)
    return fallback
  }
  if (data === null || data === undefined) return fallback
  return data as T
}

function filterParams(filters: FilterContext, extra: Record<string, unknown> = {}) {
  return { filters: filtersToJson(filters), ...extra }
}

// ---------------------------------------------------------------------------
// Generic row shapes returned by c3_* RPCs and lightweight mapping helpers.
// ---------------------------------------------------------------------------

type RpcRow = Record<string, unknown>

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length ? value : null
}

function boolOrFalse(value: unknown): boolean {
  return value === true || value === 'true' || value === 't' || value === 1
}

/** Reads the first present key from a row, in priority order. */
function pick(row: RpcRow, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key]
  }
  return undefined
}

/** Coerce jsonb RPC payloads into row arrays (arrays pass through; objects → []). */
function asRpcRows(data: unknown): RpcRow[] {
  if (Array.isArray(data)) {
    return data.filter((row): row is RpcRow => row !== null && typeof row === 'object')
  }
  return []
}

function rowsToPoints(
  rows: unknown,
  xKeys: string[],
  yKeys: string[],
  opts: { seriesKeys?: string[]; nKeys?: string[]; minCell?: number } = {},
): { points: ChartSeriesPoint[]; suppressed: boolean } {
  const minCell = opts.minCell ?? 0
  let suppressed = false
  const points: ChartSeriesPoint[] = []
  for (const row of asRpcRows(rows)) {
    const x = pick(row, xKeys)
    const y = pick(row, yKeys)
    if (x === undefined || y === undefined) continue
    const n = opts.nKeys ? numOrNull(pick(row, opts.nKeys)) : null
    if (minCell > 0 && n !== null && n < minCell) {
      suppressed = true
      continue
    }
    const point: ChartSeriesPoint = { x: x as string | number, y: Number(y) }
    if (opts.seriesKeys) {
      const series = pick(row, opts.seriesKeys)
      if (typeof series === 'string') point.series = series
    }
    if (n !== null) point.meta = { n }
    points.push(point)
  }
  return { points, suppressed }
}

function emptyChart(
  id: string,
  title: string,
  form: ChartForm,
  dimension: string,
  measure: string,
  emptyReason = 'Database not configured or Class 3 RPC not deployed yet.',
): ChartPayload {
  return {
    id,
    title,
    form,
    dimension,
    measure,
    points: [],
    summary: 'No data available for this cut yet.',
    emptyReason,
  }
}

const RESPONSIBLE_USE_NOTE =
  'This is a statistical association surfaced from historical data, not a prediction about any individual and not a cause. Use it to prioritize a human conversation, never as the sole basis for a people decision.'

const RISK_BAND_ORDER = ['Low', 'Moderate', 'Elevated', 'High', 'Unscored']

// ---------------------------------------------------------------------------
// Chart builders — one per c3_* RPC family.
// ---------------------------------------------------------------------------

function attritionOverTimeChart(): ChartPayload {
  return emptyChart(
    'attrition_over_time',
    'Voluntary attrition — monthly trend',
    'line',
    'period',
    'voluntary_attrition_rate',
    'A monthly attrition-trend RPC has not been deployed yet — see attrition by function for the current snapshot.',
  )
}

async function attritionByCutChart(
  filters: FilterContext,
  baseRate: number | null,
): Promise<ChartPayload> {
  const id = 'attrition_by_cut'
  const title = 'Voluntary attrition by function'
  if (!hasDatabaseConfig()) {
    return emptyChart(id, title, 'horizontal_bar', 'function', 'voluntary_attrition_rate')
  }

  const rows = await rpcJson<RpcRow[]>(
    'c3_attrition_by_cut',
    filterParams(filters, { cut: 'function' }),
    [],
  )
  const { points, suppressed } = rowsToPoints(rows, ['cut_value'], ['rate'], {
    nKeys: ['n'],
    minCell: MIN_CELL_SIZE,
  })

  return {
    id,
    title,
    form: 'horizontal_bar',
    dimension: 'function',
    measure: 'voluntary_attrition_rate',
    points: points.sort((a, b) => b.y - a.y),
    referenceLines: baseRate !== null ? [{ value: baseRate, label: 'Company voluntary rate' }] : undefined,
    methodologyId: 'voluntary_attrition_rate',
    unit: '%',
    summary: points.length
      ? 'Voluntary attrition rate by function for the current window. Movement is associated with — not caused by — any single cut.'
      : 'No voluntary attrition by function available for the current filters.',
    emptyReason: points.length ? null : 'c3_attrition_by_cut returned no cuts above the minimum cell size.',
    suppressed,
  }
}

async function tenureHazardChart(filters: FilterContext): Promise<ChartPayload> {
  const id = 'tenure_hazard'
  const title = 'Tenure hazard curve'
  if (!hasDatabaseConfig()) return emptyChart(id, title, 'line', 'tenure_band', 'hazard_rate')

  const rows = await rpcJson<RpcRow[]>('c3_tenure_hazard', filterParams(filters), [])
  const { points, suppressed } = rowsToPoints(rows, ['band'], ['rate'], {
    nKeys: ['exposed'],
    minCell: MIN_CELL_SIZE_HAZARD,
  })

  return {
    id,
    title,
    form: 'line',
    dimension: 'tenure_band',
    measure: 'hazard_rate',
    points,
    methodologyId: 'tenure_hazard',
    unit: '%',
    summary: points.length
      ? 'Probability of a voluntary exit in a given tenure band, conditional on surviving to the start of that band. Bands below the minimum cohort size are withheld.'
      : 'No tenure-hazard curve available — cohorts may be below the minimum size at every band.',
    emptyReason: points.length ? null : 'c3_tenure_hazard returned no bands above the minimum cohort size.',
    suppressed,
  }
}

async function cohortSurvivalChart(filters: FilterContext): Promise<ChartPayload> {
  const id = 'cohort_survival'
  const title = 'Cohort survival by hire year'
  if (!hasDatabaseConfig()) return emptyChart(id, title, 'line', 'hire_year', 'survival_rate')

  const rows = asRpcRows(await rpcJson<unknown>('c3_cohort_survival', filterParams(filters), []))
  const points: ChartSeriesPoint[] = []
  let suppressed = false
  const marks: [string, string][] = [
    ['m12', '12 months'],
    ['m24', '24 months'],
    ['m36', '36 months'],
  ]
  for (const row of rows) {
    const hireYear = pick(row, ['hire_year'])
    const n = numOrNull(pick(row, ['n']))
    if (hireYear === undefined) continue
    if (n !== null && n < MIN_CELL_SIZE_HAZARD) {
      suppressed = true
      continue
    }
    for (const [key, label] of marks) {
      const y = numOrNull(pick(row, [key]))
      if (y === null) continue
      points.push({
        x: hireYear as string | number,
        y,
        series: label,
        meta: n !== null ? { n } : undefined,
      })
    }
  }

  return {
    id,
    title,
    form: 'line',
    dimension: 'hire_year',
    measure: 'survival_rate',
    points,
    seriesKeys: ['12 months', '24 months', '36 months'],
    methodologyId: 'cohort_survival',
    unit: '%',
    summary: points.length
      ? 'Share of each hire-year cohort still active at 12/24/36 months since hire. Cohorts below the minimum size are withheld.'
      : 'No cohort survival curves available for the current filters.',
    emptyReason: points.length ? null : 'c3_cohort_survival returned no cohorts above the minimum size.',
    suppressed,
  }
}

interface RetentionDriverSpec {
  id: string
  title: string
  dimension: string
  rpc: string
  methodologyId: string
}

const RETENTION_DRIVER_SPECS: RetentionDriverSpec[] = [
  {
    id: 'exit_rate_by_compa_band',
    title: 'Exit rate by compa-ratio band',
    dimension: 'compa_band',
    rpc: 'c3_exit_rate_by_compa_band',
    methodologyId: 'exit_rate_by_compa_band',
  },
  {
    id: 'exit_rate_by_engagement_band',
    title: 'Exit rate by engagement band',
    dimension: 'engagement_band',
    rpc: 'c3_exit_rate_by_engagement_band',
    methodologyId: 'exit_rate_by_engagement_band',
  },
  {
    id: 'exit_rate_by_mobility_gap',
    title: 'Exit rate by internal-mobility gap',
    dimension: 'mobility_gap_band',
    rpc: 'c3_exit_rate_by_mobility_gap',
    methodologyId: 'exit_rate_by_mobility_gap',
  },
  {
    id: 'exit_rate_by_tenure_band',
    title: 'Exit rate by tenure band',
    dimension: 'tenure_band',
    rpc: 'c3_exit_rate_by_tenure_band',
    methodologyId: 'exit_rate_by_tenure_band',
  },
]

async function retentionDriverCharts(
  filters: FilterContext,
  baseRate: number | null,
): Promise<ChartPayload[]> {
  return Promise.all(
    RETENTION_DRIVER_SPECS.map(async (spec): Promise<ChartPayload> => {
      if (!hasDatabaseConfig()) {
        return emptyChart(spec.id, spec.title, 'horizontal_bar', spec.dimension, 'exit_rate')
      }
      const rows = await rpcJson<RpcRow[]>(spec.rpc, filterParams(filters), [])
      const { points, suppressed } = rowsToPoints(rows, ['band'], ['rate'], {
        nKeys: ['n'],
        minCell: MIN_CELL_SIZE,
      })
      const rowBaseRate = numOrNull(pick(rows[0] ?? {}, ['base_rate']))
      const referenceValue = rowBaseRate ?? baseRate

      return {
        id: spec.id,
        title: spec.title,
        form: 'horizontal_bar',
        dimension: spec.dimension,
        measure: 'exit_rate',
        points,
        referenceLines:
          referenceValue !== null ? [{ value: referenceValue, label: 'Company voluntary rate' }] : undefined,
        methodologyId: spec.methodologyId,
        unit: '%',
        summary: points.length
          ? `Exit rate by ${spec.dimension.replace(/_/g, ' ')}, associated with distance from the reference line — not a causal driver.`
          : `No ${spec.title.toLowerCase()} data for the current filters.`,
        emptyReason: points.length ? null : `${spec.rpc} returned no bands above the minimum cell size.`,
        suppressed,
      }
    }),
  )
}

async function managerChangeChart(filters: FilterContext): Promise<ChartPayload> {
  const id = 'attrition_around_manager_change'
  const title = 'Attrition around manager change'
  if (!hasDatabaseConfig()) return emptyChart(id, title, 'horizontal_bar', 'window', 'exit_rate')

  const row = await rpcJson<RpcRow>('c3_attrition_around_manager_change', filterParams(filters), {})
  const n = numOrNull(pick(row, ['n']))
  const before = numOrNull(pick(row, ['before_rate']))
  const after = numOrNull(pick(row, ['after_rate']))
  const baseRate = numOrNull(pick(row, ['base_rate']))
  const suppressed = n !== null && n < MIN_CELL_SIZE
  const points: ChartSeriesPoint[] = suppressed
    ? []
    : [
        ...(before !== null ? [{ x: 'Before change', y: before }] : []),
        ...(after !== null ? [{ x: 'After change', y: after }] : []),
      ]

  return {
    id,
    title,
    form: 'horizontal_bar',
    dimension: 'window',
    measure: 'exit_rate',
    points,
    referenceLines: baseRate !== null ? [{ value: baseRate, label: 'Company voluntary rate' }] : undefined,
    methodologyId: 'org_event_attrition',
    unit: '%',
    summary: points.length
      ? 'Voluntary exit rate in fixed windows before/after a manager change; a rise after the event is associated with the change, not proven to be caused by it.'
      : 'No manager-change windows have enough volume to report.',
    emptyReason: points.length
      ? null
      : 'c3_attrition_around_manager_change returned no windows above the minimum cell size.',
    suppressed,
  }
}

async function reorgChart(filters: FilterContext): Promise<ChartPayload> {
  const id = 'attrition_after_reorg'
  const title = 'Attrition after reorg'
  if (!hasDatabaseConfig()) return emptyChart(id, title, 'horizontal_bar', 'window', 'exit_rate')

  const row = await rpcJson<RpcRow>('c3_attrition_after_reorg', filterParams(filters), {})
  const n = numOrNull(pick(row, ['n']))
  const after = numOrNull(pick(row, ['after_rate']))
  const baseRate = numOrNull(pick(row, ['base_rate']))
  const suppressed = n !== null && n < MIN_CELL_SIZE
  const points: ChartSeriesPoint[] = suppressed || after === null ? [] : [{ x: 'After reorg', y: after }]

  return {
    id,
    title,
    form: 'horizontal_bar',
    dimension: 'window',
    measure: 'exit_rate',
    points,
    referenceLines: baseRate !== null ? [{ value: baseRate, label: 'Company voluntary rate' }] : undefined,
    methodologyId: 'org_event_attrition',
    unit: '%',
    summary: points.length
      ? 'Voluntary exit rate in the year after a reorg; associated with the event, not proven to be caused by it.'
      : 'No reorg windows have enough volume to report.',
    emptyReason: points.length ? null : 'c3_attrition_after_reorg returned no windows above the minimum cell size.',
    suppressed,
  }
}

async function locationChangeChart(filters: FilterContext): Promise<ChartPayload> {
  const id = 'retention_after_location_change'
  const title = 'Retention after location / work-arrangement change'
  if (!hasDatabaseConfig()) return emptyChart(id, title, 'horizontal_bar', 'window', 'retention_rate')

  const row = await rpcJson<RpcRow>('c3_retention_after_location_change', filterParams(filters), {})
  const n = numOrNull(pick(row, ['n']))
  const retention = numOrNull(pick(row, ['retention_rate']))
  const baseRate = numOrNull(pick(row, ['base_rate']))
  const suppressed = n !== null && n < MIN_CELL_SIZE
  const points: ChartSeriesPoint[] =
    suppressed || retention === null ? [] : [{ x: 'After location/work-arrangement change', y: retention }]

  return {
    id,
    title,
    form: 'horizontal_bar',
    dimension: 'window',
    measure: 'retention_rate',
    points,
    referenceLines: baseRate !== null ? [{ value: baseRate, label: 'Company baseline retention' }] : undefined,
    methodologyId: 'org_event_attrition',
    unit: '%',
    summary: points.length
      ? 'One-year retention after a location or work-arrangement change; associated with the event, not proven to be caused by it.'
      : 'No location/work-arrangement change windows have enough volume to report.',
    emptyReason: points.length
      ? null
      : 'c3_retention_after_location_change returned no windows above the minimum cell size.',
    suppressed,
  }
}

async function orgEventCharts(filters: FilterContext): Promise<ChartPayload[]> {
  return Promise.all([managerChangeChart(filters), reorgChart(filters), locationChangeChart(filters)])
}

async function exitDriverCharts(filters: FilterContext): Promise<ChartPayload[]> {
  const frequency = hasDatabaseConfig()
    ? await rpcJson<RpcRow[]>('c3_exit_driver_frequency', filterParams(filters), [])
    : []
  const { points: driverPoints, suppressed: driverSuppressed } = rowsToPoints(
    frequency,
    ['driver'],
    ['count'],
    { nKeys: ['count'], minCell: MIN_CELL_SIZE },
  )

  const themes = hasDatabaseConfig()
    ? await rpcJson<RpcRow[]>('c3_exit_themes', filterParams(filters), [])
    : []
  const { points: themePoints, suppressed: themeSuppressed } = rowsToPoints(
    themes,
    ['theme_label'],
    ['comment_count'],
    { nKeys: ['comment_count'], minCell: MIN_CELL_SIZE },
  )

  return [
    {
      id: 'exit_driver_frequency',
      title: 'Exit interview — primary drivers',
      form: 'horizontal_bar',
      dimension: 'driver',
      measure: 'exit_interview_count',
      points: driverPoints.sort((a, b) => b.y - a.y).slice(0, 12),
      methodologyId: 'exit_themes',
      summary: driverPoints.length
        ? 'Self-reported primary driver from exit interviews. Reflects who chose to be interviewed, not the full leaver population.'
        : 'No exit-interview drivers available for the current filters.',
      emptyReason: driverPoints.length ? null : 'c3_exit_driver_frequency returned no rows above the minimum cell size.',
      suppressed: driverSuppressed,
    },
    {
      id: 'exit_themes',
      title: 'Exit interview — coded themes',
      form: 'horizontal_bar',
      dimension: 'theme',
      measure: 'exit_interview_count',
      points: themePoints.sort((a, b) => b.y - a.y).slice(0, 12),
      methodologyId: 'exit_themes',
      summary: themePoints.length
        ? 'Coded themes from exit-interview comments (AI-generated labels are marked as such until reviewed), associated with — not proof of — a single root cause.'
        : 'No exit-interview themes available for the current filters.',
      emptyReason: themePoints.length ? null : 'c3_exit_themes returned no rows above the minimum cell size.',
      suppressed: themeSuppressed,
    },
  ]
}

async function riskBandDistributionChart(filters: FilterContext): Promise<ChartPayload> {
  const id = 'risk_band_distribution'
  const title = 'Attrition risk band distribution'
  if (!hasDatabaseConfig()) return emptyChart(id, title, 'horizontal_bar', 'risk_band', 'headcount')

  const rows = await rpcJson<RpcRow[]>('c3_risk_band_distribution', filterParams(filters), [])
  const { points } = rowsToPoints(rows, ['band'], ['n'])
  const ordered = [...points].sort(
    (a, b) => RISK_BAND_ORDER.indexOf(String(a.x)) - RISK_BAND_ORDER.indexOf(String(b.x)),
  )

  return {
    id,
    title,
    form: 'horizontal_bar',
    dimension: 'risk_band',
    measure: 'headcount',
    points: ordered,
    methodologyId: 'attrition_risk',
    summary: ordered.length
      ? 'Headcount by modeled attrition-risk band (risk-v0.2). A band reflects statistical association with historical exits, not a certainty of departure.'
      : 'No risk band distribution available yet.',
    emptyReason: ordered.length ? null : 'c3_risk_band_distribution returned no rows.',
  }
}

async function riskFactorContributionChart(filters: FilterContext): Promise<ChartPayload> {
  const id = 'risk_factor_contribution'
  const title = 'Risk model — factor contribution'
  if (!hasDatabaseConfig()) return emptyChart(id, title, 'horizontal_bar', 'factor', 'mean_points')

  const rows = await rpcJson<RpcRow[]>('c3_risk_factor_contribution', filterParams(filters), [])
  const { points } = rowsToPoints(rows, ['factor'], ['mean_points'])

  return {
    id,
    title,
    form: 'horizontal_bar',
    dimension: 'factor',
    measure: 'mean_points',
    points: points.sort((a, b) => b.y - a.y),
    methodologyId: 'attrition_risk',
    summary: points.length
      ? 'Average points contributed by each factor to the risk score — association with the model output, not a causal driver of attrition.'
      : 'No factor contribution breakdown available yet.',
    emptyReason: points.length ? null : 'c3_risk_factor_contribution returned no rows.',
  }
}

async function riskBacktestLiftChart(): Promise<ChartPayload> {
  const id = 'risk_backtest_lift'
  const title = 'Risk model backtest — lift by band'
  if (!hasDatabaseConfig()) return emptyChart(id, title, 'horizontal_bar', 'risk_band', 'lift')

  const rows = await rpcJson<RpcRow[]>('c3_risk_backtest', {}, [])
  const { points } = rowsToPoints(rows, ['band'], ['lift'], { nKeys: ['n'] })
  const ordered = [...points].sort(
    (a, b) => RISK_BAND_ORDER.indexOf(String(a.x)) - RISK_BAND_ORDER.indexOf(String(b.x)),
  )

  return {
    id,
    title,
    form: 'horizontal_bar',
    dimension: 'risk_band',
    measure: 'lift',
    points: ordered,
    referenceLines: [{ value: 1, label: 'Baseline (no lift)' }],
    methodologyId: 'attrition_risk',
    summary: ordered.length
      ? 'Lift of realized voluntary exits vs. the base rate, by predicted-risk band from the most recent backtest window. Historical performance, not a forward guarantee.'
      : 'No backtest results available yet.',
    emptyReason: ordered.length ? null : 'c3_risk_backtest returned no band breakdown.',
  }
}

async function managerCharts(filters: FilterContext): Promise<[ChartPayload, ChartPayload]> {
  const scatterId = 'manager_effectiveness_scatter'
  const scatterTitle = 'Manager effectiveness (team size vs. attrition)'
  const componentsId = 'manager_components'
  const componentsTitle = 'Manager effectiveness — components (company average)'

  if (!hasDatabaseConfig()) {
    return [
      emptyChart(scatterId, scatterTitle, 'scatter', 'team_size', 'team_attrition_rate'),
      emptyChart(componentsId, componentsTitle, 'horizontal_bar', 'component', 'avg_score'),
    ]
  }

  const rows = asRpcRows(await rpcJson<unknown>('c3_manager_effectiveness', filterParams(filters), []))
  const eligible = rows.filter((r) => !boolOrFalse(pick(r, ['excluded'])))

  const componentOf = (row: RpcRow, key: string): number | null => {
    const nested = row.components
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const fromNested = numOrNull((nested as RpcRow)[key])
      if (fromNested !== null) return fromNested
    }
    return numOrNull(pick(row, [key]))
  }

  const scatterPoints: ChartSeriesPoint[] = []
  for (const row of eligible) {
    const teamSize = numOrNull(pick(row, ['team_size']))
    const retention = componentOf(row, 'retention')
    if (teamSize === null || retention === null) continue
    scatterPoints.push({
      x: teamSize,
      y: Number((100 - retention).toFixed(1)),
      label: strOrNull(pick(row, ['manager_id'])) ?? undefined,
      meta: {
        managerId: strOrNull(pick(row, ['manager_id'])),
        effectivenessScore: numOrNull(pick(row, ['composite_score', 'composite'])),
        engagementIndex: componentOf(row, 'engagement_vs_company') ?? componentOf(row, 'engagement'),
      },
    })
  }

  const scatterChart: ChartPayload = {
    id: scatterId,
    title: scatterTitle,
    form: 'scatter',
    dimension: 'team_size',
    measure: 'team_attrition_rate',
    points: scatterPoints,
    methodologyId: 'manager_effectiveness',
    unit: '%',
    summary: scatterPoints.length
      ? 'Each point is one manager with a team at or above the minimum size. Position is associative context for a 1:1 conversation, not a performance verdict.'
      : 'No manager effectiveness data available for the current filters.',
    emptyReason: scatterPoints.length
      ? null
      : 'c3_manager_effectiveness returned no managers above the minimum team size.',
  }

  const avg = (key: string): number | null => {
    const values = eligible.map((r) => componentOf(r, key)).filter((v): v is number => v !== null)
    return values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)) : null
  }
  const componentValues: { label: string; value: number | null }[] = [
    { label: 'Retention', value: avg('retention') },
    { label: 'Engagement', value: avg('engagement_vs_company') },
    { label: 'Rating deviation', value: avg('rating_distribution_deviation') },
    { label: 'Promotion rate', value: avg('promotion_rate') },
  ]
  const componentPoints: ChartSeriesPoint[] = componentValues
    .filter((c): c is { label: string; value: number } => c.value !== null)
    .map((c) => ({ x: c.label, y: c.value }))

  const componentsChart: ChartPayload = {
    id: componentsId,
    title: componentsTitle,
    form: 'horizontal_bar',
    dimension: 'component',
    measure: 'avg_score',
    points: componentPoints,
    methodologyId: 'manager_effectiveness',
    summary: componentPoints.length
      ? 'Company average of the four percentile-style components (0–100) that make up the manager effectiveness composite. Never shown for an individual manager without all four components.'
      : 'No manager effectiveness components available for the current filters.',
    emptyReason: componentPoints.length ? null : 'c3_manager_effectiveness returned no eligible managers.',
  }

  return [scatterChart, componentsChart]
}

async function ratingDistributionChart(filters: FilterContext): Promise<ChartPayload> {
  const id = 'rating_distribution'
  const title = 'Performance rating distribution'
  if (!hasDatabaseConfig()) return emptyChart(id, title, 'histogram', 'rating', 'observed_pct')

  const rows = await rpcJson<unknown>('c3_rating_distribution', filterParams(filters), [])
  const { points } = rowsToPoints(rows, ['rating'], ['pct', 'observed_pct', 'n'])

  return {
    id,
    title,
    form: 'histogram',
    dimension: 'rating',
    measure: 'observed_pct',
    points,
    unit: '%',
    methodologyId: 'rating_distribution',
    summary: points.length
      ? 'Latest performance rating distribution for the filtered population, alongside a static company benchmark referenced in methodology.'
      : 'No rating distribution available for the current filters.',
    emptyReason: points.length ? null : 'c3_rating_distribution returned no rows.',
  }
}

async function promotionPipelineChart(filters: FilterContext): Promise<ChartPayload> {
  const id = 'promotion_pipeline'
  const title = 'Promotion pipeline'
  if (!hasDatabaseConfig()) return emptyChart(id, title, 'stage_bars', 'stage', 'headcount')

  const row = await rpcJson<RpcRow>('c3_promotion_pipeline', filterParams(filters), {})
  const stages: [string, string][] = [
    ['recommended', 'Recommended'],
    ['effective', 'Approved & effective'],
    ['approved_not_effective', 'Approved, not yet effective'],
  ]
  const points: ChartSeriesPoint[] = []
  for (const [key, label] of stages) {
    const n = numOrNull(pick(row, [key]))
    if (n === null) continue
    points.push({ x: label, y: n })
  }

  return {
    id,
    title,
    form: 'stage_bars',
    dimension: 'stage',
    measure: 'headcount',
    points,
    methodologyId: 'promotion_readiness',
    summary: points.length
      ? 'Headcount by promotion-pipeline stage, from recommended through approved-and-effective.'
      : 'No promotion pipeline data available for the current filters.',
    emptyReason: points.length ? null : 'c3_promotion_pipeline returned no rows.',
  }
}

async function readinessDistributionChart(filters: FilterContext): Promise<ChartPayload> {
  const id = 'readiness_distribution'
  const title = 'Promotion readiness distribution'
  if (!hasDatabaseConfig()) return emptyChart(id, title, 'horizontal_bar', 'readiness', 'headcount')

  const rows = await rpcJson<unknown>('c3_readiness_distribution', filterParams(filters), [])
  const { points } = rowsToPoints(rows, ['readiness', 'class'], ['n'])

  return {
    id,
    title,
    form: 'horizontal_bar',
    dimension: 'readiness',
    measure: 'headcount',
    points,
    methodologyId: 'promotion_readiness',
    summary: points.length
      ? 'Evidence-based readiness classification for the filtered population, derived from rating and time-since-promotion — not a recommendation.'
      : 'No readiness distribution available for the current filters.',
    emptyReason: points.length ? null : 'c3_readiness_distribution returned no rows above the minimum cell size.',
  }
}

async function benchCoverageChart(filters: FilterContext): Promise<ChartPayload> {
  const id = 'bench_coverage'
  const title = 'Succession bench coverage'
  if (!hasDatabaseConfig()) return emptyChart(id, title, 'horizontal_bar', 'role_or_function', 'coverage_pct')

  // RPC returns a single summary object (not a row array) — see metrics.c3_bench_coverage.
  const row = await rpcJson<RpcRow>('c3_bench_coverage', filterParams(filters), {})
  const suppressed = boolOrFalse(pick(row, ['suppressed']))
  const coveragePct = numOrNull(pick(row, ['proxy_successor_pct_of_active']))
  const coverageRatio = numOrNull(pick(row, ['proxy_successor_coverage_ratio']))
  const successorCount = numOrNull(pick(row, ['proxy_successor_count']))
  const managerPositions = numOrNull(pick(row, ['manager_positions']))
  const limitation =
    strOrNull(pick(row, ['data_note', 'limitation'])) ??
    'Bench coverage is a nine-box proxy for succession-ready strength, not a formal successor designation.'

  const points: ChartSeriesPoint[] = suppressed
    ? []
    : coveragePct !== null
      ? [
          {
            x: 'Ready-now share of active',
            y: coveragePct,
            meta: { successorCount, managerPositions, coverageRatio },
          },
        ]
      : []

  const ratioNote =
    coverageRatio !== null && managerPositions !== null && successorCount !== null
      ? ` Proxy successors ${successorCount.toLocaleString()} vs ${managerPositions.toLocaleString()} manager seats (ratio ${coverageRatio}).`
      : ''

  return {
    id,
    title,
    form: 'horizontal_bar',
    dimension: 'role_or_function',
    measure: 'coverage_pct',
    points,
    unit: '%',
    methodologyId: 'succession_bench',
    summary: points.length
      ? `${limitation}${ratioNote}`
      : 'No bench coverage data available for the current filters.',
    emptyReason: points.length ? null : 'c3_bench_coverage returned no usable coverage measures.',
    suppressed,
  }
}

// ---------------------------------------------------------------------------
// Investigation guidance
// ---------------------------------------------------------------------------

function buildRetentionDriverGuidance(
  driverCharts: ChartPayload[],
  baseRate: number | null,
): InvestigationGuidance | null {
  const withData = driverCharts.filter((c) => c.points.length)
  if (!withData.length) return null

  let topChart: ChartPayload | null = null
  let topPoint: ChartSeriesPoint | null = null
  for (const chart of withData) {
    for (const point of chart.points) {
      if (!topPoint || point.y > topPoint.y) {
        topPoint = point
        topChart = chart
      }
    }
  }
  if (!topChart || !topPoint) return null

  return {
    signal: `Elevated exit rate — ${topChart.dimension.replace(/_/g, ' ')} = ${topPoint.x}`,
    scope: 'Filtered population, TTM',
    period: 'Trailing twelve months',
    supporting_measures: [topChart.id, 'voluntary_attrition_rate'],
    comparison: baseRate !== null ? `${topPoint.y}% vs. company base rate of ${baseRate}%` : 'vs. company base rate',
    factor_summary: `${topChart.title} shows ${topPoint.x} with the highest exit rate in this cut. This is an association within the selected filters, not a ranked causal driver.`,
    data_limitations:
      'Cells below the minimum size are withheld and may hide equally large effects elsewhere. Cuts are not mutually exclusive — an employee can appear in multiple elevated bands at once.',
    suggested_next_analysis: [
      'Cross this cut with tenure and manager to see if the effect concentrates further.',
      'Check whether the same population shows up in the risk factor contribution chart.',
    ],
    suggested_human_questions: [
      'Are there recent changes (comp, workload, manager) specific to this group worth asking about directly?',
    ],
    methodology_links: [topChart.methodologyId ?? 'voluntary_attrition_rate', 'regrettable_dual'],
    responsible_use_note: RESPONSIBLE_USE_NOTE,
  }
}

function buildRiskConcentrationGuidance(
  riskBandChart: ChartPayload,
  factorChart: ChartPayload,
): InvestigationGuidance | null {
  if (!riskBandChart.points.length || !factorChart.points.length) return null
  const elevatedPlus = riskBandChart.points
    .filter((p) => p.x === 'Elevated' || p.x === 'High')
    .reduce((sum, p) => sum + p.y, 0)
  const topFactor = [...factorChart.points].sort((a, b) => b.y - a.y)[0]

  return {
    signal: 'Concentration of elevated/high modeled attrition risk',
    scope: 'Filtered population, current snapshot',
    period: 'As of latest snapshot load',
    supporting_measures: ['risk_band_distribution', 'risk_factor_contribution'],
    comparison: null,
    factor_summary: [
      `${elevatedPlus} employees fall in the elevated or high risk band under risk-v0.2.`,
      topFactor
        ? `${topFactor.x} has the largest average point contribution to risk scores in this population.`
        : 'Factor-level detail is not yet available for this cut.',
      'The score is a weighted statistical association with historical voluntary exits, not a certainty of departure.',
    ].join(' '),
    data_limitations:
      'The model is trained on historical exits and may under-weight emerging or unprecedented drivers. Backtest lift describes past performance and is not a guarantee of future accuracy.',
    suggested_next_analysis: [
      'Open manager effectiveness for managers whose teams cluster in the elevated/high bands.',
      'Review the backtest lift chart to gauge current model reliability before acting.',
    ],
    suggested_human_questions: [
      'For employees flagged elevated or high, has their manager had a stay conversation in the last quarter?',
    ],
    methodology_links: ['attrition_risk', 'risk-v0.2'],
    responsible_use_note: RESPONSIBLE_USE_NOTE,
  }
}

// ---------------------------------------------------------------------------
// Detail table
// ---------------------------------------------------------------------------

async function advancedAnalyticsSummaryTable(filters: FilterContext): Promise<DetailTable> {
  const columns: DetailTable['columns'] = [
    { key: 'cut', label: 'Function' },
    { key: 'voluntary_rate', label: 'Voluntary rate', format: 'rate' },
    { key: 'headcount', label: 'Headcount', format: 'count' },
  ]
  if (!hasDatabaseConfig()) {
    return { id: 'advanced_summary', title: 'Attrition summary by function', columns, rows: [] }
  }

  const rows = await rpcJson<RpcRow[]>(
    'c3_attrition_by_cut',
    filterParams(filters, { cut: 'function' }),
    [],
  )
  const tableRows = rows
    .filter((r) => !boolOrFalse(pick(r, ['suppressed'])))
    .map((r) => ({
      cut: strOrNull(pick(r, ['cut_value'])),
      voluntary_rate: numOrNull(pick(r, ['rate'])),
      headcount: numOrNull(pick(r, ['n'])),
    }))
    .sort((a, b) => (b.voluntary_rate ?? 0) - (a.voluntary_rate ?? 0))

  return { id: 'advanced_summary', title: 'Attrition summary by function', columns, rows: tableRows }
}

// ---------------------------------------------------------------------------
// Methodology panel
// ---------------------------------------------------------------------------

const RISK_FACTOR_WEIGHTS: { factor: string; calibrated: number; published: number }[] = [
  { factor: 'engagement_trajectory', calibrated: 24, published: 25 },
  { factor: 'compensation_position', calibrated: 19, published: 20 },
  { factor: 'performance_mobility_gap', calibrated: 18, published: 20 },
  { factor: 'manager_context', calibrated: 16, published: 15 },
  { factor: 'tenure_stage', calibrated: 12, published: 10 },
  { factor: 'org_events', calibrated: 11, published: 10 },
]

function buildMethodologyPanel(backtest: ChartPayload): AdvancedAnalyticsMethodologyPanel {
  const elevated = backtest.points.find((p) => p.x === 'Elevated')
  const high = backtest.points.find((p) => p.x === 'High')
  const backtestSummary =
    elevated || high
      ? `Elevated-band employees left at ${elevated ? `${elevated.y}x` : '—'} the base rate and High-band at ${
          high ? `${high.y}x` : '—'
        } over the most recent backtest window.`
      : null

  return {
    methodologyVersion: 'risk-v0.2',
    factorWeightVersion: 'published-rounded-v1',
    bandThresholdVersion: 'bands-v1',
    weights: RISK_FACTOR_WEIGHTS,
    bands: { low: '< 25', moderate: '25–49', elevated: '50–74', high: '75+' },
    minCellManager: MIN_CELL_SIZE,
    minCellHazard: MIN_CELL_SIZE_HAZARD,
    responsibleUse: RESPONSIBLE_USE_NOTE,
    backtestSummary,
  }
}

// ---------------------------------------------------------------------------
// Risk score mapping — shared by Employee 360 (attrition_risk_score is
// embedded server-side inside c3_employee_360's `risk` key).
// ---------------------------------------------------------------------------

const RISK_BANDS: NonNullable<AttritionRiskScore['risk_band']>[] = ['Low', 'Moderate', 'Elevated', 'High']
const RISK_FACTOR_STATUSES: RiskFactorStatus[] = ['complete', 'partial', 'insufficient', 'inapplicable']

function toRiskBand(value: unknown): AttritionRiskScore['risk_band'] {
  const s = strOrNull(value)
  return s && (RISK_BANDS as string[]).includes(s) ? (s as AttritionRiskScore['risk_band']) : null
}

function toRiskFactorStatus(value: unknown): RiskFactorStatus {
  const s = strOrNull(value)
  return s && (RISK_FACTOR_STATUSES as string[]).includes(s) ? (s as RiskFactorStatus) : 'insufficient'
}

function toDrivingValue(value: unknown): string | number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number' || typeof value === 'string') return value
  return String(value)
}

function buildRiskScore(raw: RpcRow): AttritionRiskScore {
  const factorsRaw = Array.isArray(raw.factors) ? (raw.factors as RpcRow[]) : []
  const factors: RiskFactorResult[] = factorsRaw.map((f) => ({
    factor: strOrNull(pick(f, ['factor'])) ?? 'unknown_factor',
    available: boolOrFalse(pick(f, ['available'])),
    status: toRiskFactorStatus(pick(f, ['status'])),
    points: numOrNull(pick(f, ['points'])) ?? 0,
    maximum_points: numOrNull(pick(f, ['maximum_points'])) ?? 0,
    driving_value: toDrivingValue(pick(f, ['driving_value'])),
    reason: strOrNull(pick(f, ['reason'])) ?? '',
    missing_reason: strOrNull(pick(f, ['missing_reason'])),
    source_measure: strOrNull(pick(f, ['source_measure'])) ?? '',
    as_of_date: strOrNull(pick(f, ['as_of_date'])),
  }))

  return {
    total_score: numOrNull(pick(raw, ['total_score'])),
    risk_band: toRiskBand(pick(raw, ['risk_band'])),
    data_sufficiency:
      (strOrNull(pick(raw, ['data_sufficiency'])) as AttritionRiskScore['data_sufficiency']) ?? 'insufficient',
    available_factor_count: numOrNull(pick(raw, ['available_factor_count'])) ?? 0,
    missing_factor_count: numOrNull(pick(raw, ['missing_factor_count'])) ?? 0,
    methodology_version: strOrNull(pick(raw, ['methodology_version'])) ?? 'risk-v0.2',
    factor_weight_version: strOrNull(pick(raw, ['factor_weight_version'])) ?? 'published-rounded-v1',
    band_threshold_version: strOrNull(pick(raw, ['band_threshold_version'])) ?? 'bands-v1',
    calculated_at: strOrNull(pick(raw, ['calculated_at'])) ?? new Date().toISOString(),
    reporting_boundary: strOrNull(pick(raw, ['reporting_boundary'])),
    data_load_id: strOrNull(pick(raw, ['data_load_id'])),
    factors,
  }
}

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

export async function getAdvancedAnalyticsPage(
  filters: FilterContext,
): Promise<AdvancedAnalyticsResponse> {
  const f = effectiveFilters(filters)
  const freshness = await getFreshness()

  const [voluntaryRate, involuntaryRate, regrettable, elevatedRiskHeadcount, managersBelowMedian] =
    await Promise.all([
      rpcNumber('c3_voluntary_attrition_rate', filterParams(f)),
      rpcNumber('c3_involuntary_attrition_rate', filterParams(f)),
      rpcJson<RpcRow>('c3_regrettable_attrition', filterParams(f), {}),
      rpcNumber('c3_elevated_risk_headcount', filterParams(f)),
      rpcNumber('c3_managers_below_median_count', filterParams(f)),
    ])

  const kpis: KpiTile[] = [
    {
      id: 'voluntary_attrition_rate_ttm',
      label: 'Voluntary attrition (TTM)',
      value: voluntaryRate ?? 0,
      format: 'rate',
      delta: null,
      methodologyId: 'voluntary_attrition_rate',
      unit: '%',
    },
    {
      id: 'involuntary_attrition_rate_ttm',
      label: 'Involuntary attrition (TTM)',
      value: involuntaryRate ?? 0,
      format: 'rate',
      delta: null,
      methodologyId: 'involuntary_attrition',
      unit: '%',
    },
    {
      id: 'regrettable_attrition_derived',
      label: 'Regrettable attrition (derived)',
      value: numOrNull(pick(regrettable, ['derived_count'])) ?? 0,
      format: 'count',
      delta: null,
      methodologyId: 'regrettable_dual',
    },
    {
      id: 'regrettable_attrition_exit_flagged',
      label: 'Regrettable attrition (exit-flagged)',
      value: numOrNull(pick(regrettable, ['exit_flag_count'])) ?? 0,
      format: 'count',
      delta: null,
      methodologyId: 'regrettable_dual',
    },
    {
      id: 'elevated_risk_headcount',
      label: 'Elevated+ risk headcount',
      value: elevatedRiskHeadcount ?? 0,
      format: 'count',
      delta: null,
      methodologyId: 'attrition_risk',
    },
    {
      id: 'managers_below_median',
      label: 'Managers below median effectiveness',
      value: managersBelowMedian ?? 0,
      format: 'count',
      delta: null,
      methodologyId: 'manager_effectiveness',
    },
  ]

  const [
    attritionByCut,
    tenureHazard,
    cohortSurvival,
    retentionDrivers,
    orgEvents,
    exitDrivers,
    riskBandDistribution,
    riskFactorContribution,
    backtestLift,
    managerChartPair,
    ratingDistribution,
    promotionPipeline,
    readinessDistribution,
    benchCoverage,
  ] = await Promise.all([
    attritionByCutChart(f, voluntaryRate),
    tenureHazardChart(f),
    cohortSurvivalChart(f),
    retentionDriverCharts(f, voluntaryRate),
    orgEventCharts(f),
    exitDriverCharts(f),
    riskBandDistributionChart(f),
    riskFactorContributionChart(f),
    riskBacktestLiftChart(),
    managerCharts(f),
    ratingDistributionChart(f),
    promotionPipelineChart(f),
    readinessDistributionChart(f),
    benchCoverageChart(f),
  ])
  const [managerScatter, managerComponents] = managerChartPair

  const charts: ChartPayload[] = [
    attritionOverTimeChart(),
    attritionByCut,
    tenureHazard,
    cohortSurvival,
    ...retentionDrivers,
    ...orgEvents,
    ...exitDrivers,
    riskBandDistribution,
    riskFactorContribution,
    backtestLift,
    managerScatter,
    managerComponents,
    ratingDistribution,
    promotionPipeline,
    readinessDistribution,
    benchCoverage,
  ]

  const guidance = [
    buildRetentionDriverGuidance(retentionDrivers, voluntaryRate),
    buildRiskConcentrationGuidance(riskBandDistribution, riskFactorContribution),
  ].filter((g): g is InvestigationGuidance => g !== null)

  // Always surface at least two guidance panels, even without data, so the
  // UI can render the "how to read this" framing before Class 3 RPCs ship.
  while (guidance.length < 2) {
    guidance.push({
      signal: guidance.length === 0 ? 'Retention drivers — awaiting data' : 'Attrition risk model — awaiting data',
      scope: 'Filtered population',
      period: 'Trailing twelve months',
      supporting_measures: [],
      comparison: null,
      factor_summary:
        'No Class 3 data is available yet for this cut — guidance will populate once RPCs return rows.',
      data_limitations: 'Database not configured, or the relevant c3_* RPC has not been deployed yet.',
      suggested_next_analysis: [
        'Confirm employee_snapshots, termination_history, and exit_interviews have been loaded.',
      ],
      suggested_human_questions: [],
      methodology_links: ['attrition_risk'],
      responsible_use_note: RESPONSIBLE_USE_NOTE,
    })
  }

  return {
    pageId: 'advanced_analytics',
    kpis,
    charts,
    table: await advancedAnalyticsSummaryTable(f),
    freshness,
    filterEcho: filters,
    guidance,
    methodologyPanel: buildMethodologyPanel(backtestLift),
    backtest: backtestLift,
  }
}

export async function getManagerDetail(
  managerId: string,
  filters: FilterContext,
): Promise<ManagerDetailResponse> {
  const f = effectiveFilters(filters)
  const freshness = await getFreshness()
  const emptyTable: DetailTable = { id: 'manager_components', title: 'Effectiveness components', columns: [], rows: [] }

  if (!hasDatabaseConfig()) {
    return {
      managerId,
      suppressed: false,
      suppressionReason: null,
      teamSize: 0,
      spanOfControl: 0,
      managerDebt: false,
      kpis: [],
      charts: [],
      table: emptyTable,
      peerBasis: null,
      freshness,
      filterEcho: filters,
      responsibleUseNote: RESPONSIBLE_USE_NOTE,
    }
  }

  const detail = await rpcJson<RpcRow>(
    'c3_manager_detail',
    { manager_id: managerId, filters: filtersToJson(f) },
    {},
  )
  const teamSize = numOrNull(pick(detail, ['team_size'])) ?? 0
  const spanOfControl = numOrNull(pick(detail, ['span'])) ?? teamSize
  const managerDebt = boolOrFalse(pick(detail, ['manager_debt']))
  const suppressed = boolOrFalse(pick(detail, ['suppressed'])) || Object.keys(detail).length === 0

  if (suppressed) {
    return {
      managerId,
      suppressed: true,
      suppressionReason:
        strOrNull(pick(detail, ['reason'])) ??
        `Team size ${teamSize} is below the minimum cell size (${MIN_CELL_SIZE}).`,
      teamSize,
      spanOfControl,
      managerDebt,
      kpis: [],
      charts: [],
      table: emptyTable,
      peerBasis: null,
      freshness,
      filterEcho: filters,
      responsibleUseNote: RESPONSIBLE_USE_NOTE,
    }
  }

  const voluntaryRate = numOrNull(pick(detail, ['voluntary_rate']))
  const engagementMean = numOrNull(pick(detail, ['engagement_mean']))
  const componentsRaw =
    detail.components && typeof detail.components === 'object' ? (detail.components as RpcRow) : null
  const composite = componentsRaw ? numOrNull(pick(componentsRaw, ['composite'])) : null

  const kpis: KpiTile[] = [
    {
      id: 'manager_team_voluntary_rate',
      label: 'Team voluntary attrition (TTM)',
      value: voluntaryRate ?? 0,
      format: 'rate',
      delta: null,
      methodologyId: 'voluntary_attrition_rate',
      unit: '%',
    },
    {
      id: 'manager_team_engagement',
      label: 'Team engagement (0–10)',
      value: engagementMean ?? 0,
      format: 'score',
      delta: null,
      methodologyId: 'engagement_per_employee',
    },
  ]
  if (composite !== null) {
    kpis.push({
      id: 'manager_effectiveness_composite',
      label: 'Effectiveness composite',
      value: composite,
      format: 'score',
      delta: null,
      methodologyId: 'manager_effectiveness',
    })
  }

  const riskRows = Array.isArray(detail.risk_by_cohort) ? (detail.risk_by_cohort as RpcRow[]) : []
  const { points: riskPoints } = rowsToPoints(riskRows, ['band'], ['n'])
  const orderedRisk = [...riskPoints].sort(
    (a, b) => RISK_BAND_ORDER.indexOf(String(a.x)) - RISK_BAND_ORDER.indexOf(String(b.x)),
  )
  const charts: ChartPayload[] = orderedRisk.length
    ? [
        {
          id: 'team_risk_band_distribution',
          title: 'Team attrition-risk band distribution',
          form: 'horizontal_bar',
          dimension: 'risk_band',
          measure: 'headcount',
          points: orderedRisk,
          methodologyId: 'attrition_risk',
          summary:
            'Headcount by modeled attrition-risk band for this team — a prompt to prioritize conversations, not individual verdicts.',
        },
      ]
    : []

  const table: DetailTable = componentsRaw
    ? {
        id: 'manager_components',
        title: 'Effectiveness components',
        columns: [
          { key: 'component', label: 'Component' },
          { key: 'value', label: 'Score (0–100)', format: 'score' },
        ],
        rows: [
          { component: 'Retention', value: numOrNull(pick(componentsRaw, ['retention'])) },
          { component: 'Engagement', value: numOrNull(pick(componentsRaw, ['engagement'])) },
          { component: 'Rating deviation', value: numOrNull(pick(componentsRaw, ['rating_dev'])) },
          { component: 'Promotion rate', value: numOrNull(pick(componentsRaw, ['promotion_rate'])) },
        ],
      }
    : emptyTable

  return {
    managerId,
    suppressed: false,
    suppressionReason: null,
    teamSize,
    spanOfControl,
    managerDebt,
    kpis,
    charts,
    table,
    peerBasis: strOrNull(pick(detail, ['peer_basis'])),
    freshness,
    filterEcho: filters,
    responsibleUseNote: RESPONSIBLE_USE_NOTE,
  }
}

export async function getEmployee360(employeeId: string): Promise<Employee360Response> {
  const freshness = await getFreshness()

  const emptyResult = (note: string): Employee360Response => ({
    employeeId,
    profile: {},
    modules: [],
    risk: null,
    charts: [],
    freshness,
    responsibleUseNote: RESPONSIBLE_USE_NOTE,
    dataSufficiencyNote: note,
  })

  if (!hasDatabaseConfig()) return emptyResult('Database not configured.')

  const result = await rpcJson<RpcRow>('c3_employee_360', { employee_id: employeeId }, {})
  const profileRaw =
    result.profile && typeof result.profile === 'object' ? (result.profile as RpcRow) : null
  if (!profileRaw || Object.keys(profileRaw).length === 0) {
    return emptyResult('c3_employee_360 returned no profile for this employee ID.')
  }

  // Explicitly pass through only what the RPC returns — the SQL layer never
  // selects gender or race for this surface, and neither does this mapping.
  const profile: Record<string, string | number | null> = {}
  for (const [key, value] of Object.entries(profileRaw)) {
    if (typeof value === 'number' || typeof value === 'string') profile[key] = value
    else profile[key] = value === null || value === undefined ? null : String(value)
  }

  const modulesRaw = Array.isArray(result.modules) ? (result.modules as RpcRow[]) : []
  const modules = modulesRaw.map((mod) => {
    const columnsRaw = Array.isArray(mod.columns) ? (mod.columns as RpcRow[]) : []
    const rowsRaw = Array.isArray(mod.rows) ? (mod.rows as RpcRow[]) : []
    const columns: DetailTable['columns'] = columnsRaw.map((c) => ({
      key: strOrNull(pick(c, ['key'])) ?? '',
      label: strOrNull(pick(c, ['label'])) ?? '',
    }))
    const rows: DetailTable['rows'] = rowsRaw.map((r) => {
      const row: Record<string, string | number | null> = {}
      for (const col of columns) {
        const value = r[col.key]
        row[col.key] = typeof value === 'number' || typeof value === 'string' ? value : value == null ? null : String(value)
      }
      return row
    })
    const id = strOrNull(pick(mod, ['id'])) ?? 'module'
    const title = strOrNull(pick(mod, ['title'])) ?? 'Module'
    return { id, title, rows: { id, title, columns, rows } }
  })

  const riskRaw = result.risk && typeof result.risk === 'object' ? (result.risk as RpcRow) : null
  const risk = riskRaw ? buildRiskScore(riskRaw) : null

  const dataSufficiencyNote = risk
    ? `Retention-risk indicator data sufficiency: ${risk.data_sufficiency}. Available factors ${risk.available_factor_count}/${
        risk.available_factor_count + risk.missing_factor_count
      }.`
    : strOrNull(pick(result, ['data_sufficiency_note']))

  return {
    employeeId,
    profile,
    modules,
    risk,
    charts: [],
    freshness,
    responsibleUseNote: RESPONSIBLE_USE_NOTE,
    dataSufficiencyNote,
  }
}
