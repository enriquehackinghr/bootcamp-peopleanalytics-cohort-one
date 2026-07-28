// Staging ground for the eventual lib/types.ts contract owned by Developer 1.
// Every shape declared here must map 1:1 onto the contract when it lands, so the
// swap is a rename + re-export. If a page or component reaches for a Meridian
// type, it MUST import from this file (never from mock or component-local decls).

// ─── Filter context ────────────────────────────────────────────────────────
export type PeriodMode = 'ttm' | 'ytd' | 'quarter' | 'month'

export type ComparisonMode = 'none' | 'prior-period' | 'year-over-year'

export interface FilterContext {
  functions?: string[]
  locations?: string[]
  levelBands?: string[]
  tenureBands?: string[]
  period: PeriodMode
  comparison: ComparisonMode
  // Derived by the server from data_loads.max(event_date), never a constant.
  asOf?: string // ISO date
}

// ─── Common measure envelope ──────────────────────────────────────────────
export interface MeasureValue {
  value: number
  delta?: number
  deltaKind?: 'absolute' | 'percent' | 'percentage-points'
  polarity: 'good-up' | 'good-down' | 'neutral'
  unit?: 'count' | 'percent' | 'currency-usd' | 'ratio' | 'days' | 'score-5' | 'score-10'
  format?: 'compact' | 'precise'
}

export interface Series<T = { label: string; value: number }> {
  key: string
  label: string
  slot?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 // maps to --s1..--s8 in fixed order
  points: T[]
}

// ─── Page response shapes (mirror /app/api/*) ─────────────────────────────
export interface ExecutiveOverviewResponse {
  kpis: {
    activeHeadcount: MeasureValue
    voluntaryAttritionTTM: MeasureValue
    openReqs: MeasureValue
    engagementMean: MeasureValue
    medianCompaRatio: MeasureValue
    elevatedFlightRisk: MeasureValue
  }
  headcountTrend: Series
  compositionByFunction: Series
  attritionByType: { voluntary: Series; involuntary: Series; regrettable: Series }
  recruitingFunnel: FunnelStages
  engagementByCategory: Series & { companyMean: number }
}

export interface FunnelStages {
  stages: Array<{ key: string; label: string; count: number }>
  // conversion[i] = stages[i+1].count / stages[i].count
}

// ─── Wizard contract (WIZ-4) ──────────────────────────────────────────────
export type ChartForm =
  | 'line'
  | 'horizontal-bar'
  | 'stacked-bar'
  | 'histogram'
  | 'scatter'
  | 'funnel-stages'
  | 'heatmap'
  | 'stat-tile'

export interface WizardChartSpec {
  form: ChartForm
  title: string
  subtitle?: string
  dimension: string
  measure: string
  series?: string[]
  filters?: Partial<FilterContext>
  annotations?: Array<
    | { kind: 'reference-line'; value: number; label: string }
    | { kind: 'benchmark-band'; from: number; to: number; label: string }
    | { kind: 'outlier'; entityId: string; label: string }
    | { kind: 'period-marker'; at: string; label: string }
  >
}

export interface WizardResponse {
  answer: string // narrative
  citations: Array<{ measure: string; tables: string[] }>
  chart?: WizardChartSpec
  refusal?: {
    reason: 'individual-comp' | 'min-cell-size' | 'engagement-identification'
    friendlyMessage: string
  }
}

// ─── Data freshness (reads from data_loads, never a constant) ─────────────
export interface DataFreshness {
  asOf: string // ISO date derived from max event date
  loadedAt: string // ISO timestamp of the last successful data_loads row
  loadedBy?: string
  source: 'file-adapter' | 'api-adapter' | 'mock'
}
