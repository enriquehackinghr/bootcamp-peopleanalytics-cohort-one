import type {
  CustomizedReportSpec,
  FilterContext,
  WizardChartSpec,
  WizardCitation,
  WizardConversationTurn,
} from '@/lib/types'
import { EMPTY_FILTER_CONTEXT } from '@/lib/types'

const APPROVED_MEASURES = new Set([
  'active_headcount',
  'voluntary_attrition_rate',
  'c3_voluntary_attrition_rate',
  'c3_involuntary_attrition_rate',
  'attrition_risk',
  'manager_effectiveness',
  'tenure_hazard',
  'cohort_survival',
  'exit_rate_by_compa_band',
  'promotion_readiness',
  'succession_bench',
  'engagement_survey_mean',
  'median_compa_ratio',
])

export function pickRenderableChart(
  primary: WizardChartSpec | null | undefined,
  fallback: WizardChartSpec | null | undefined,
): WizardChartSpec | null {
  if (primary?.points?.length) return primary
  if (fallback?.points?.length) return fallback
  return primary ?? fallback ?? null
}

export function pickRenderableCharts(
  primary: WizardChartSpec[],
  fallback: WizardChartSpec[],
): WizardChartSpec[] {
  const fromPrimary = primary.filter((c) => c.points?.length)
  if (fromPrimary.length) return fromPrimary
  return fallback.filter((c) => c.points?.length)
}

export function findLastChartInConversation(
  conversation: WizardConversationTurn[] | undefined,
): WizardChartSpec | null {
  return findLastChartsInConversation(conversation)[0] ?? null
}

export function findLastChartsInConversation(
  conversation: WizardConversationTurn[] | undefined,
): WizardChartSpec[] {
  if (!conversation?.length) return []
  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    const turn = conversation[i]
    const charts = [
      ...(turn?.charts ?? []),
      ...(turn?.chart ? [turn.chart] : []),
    ].filter((c) => c.points?.length)
    if (charts.length) return charts
  }
  return []
}

function approvedMeasures(
  charts: WizardChartSpec[],
  citations: WizardCitation[] | undefined,
): string[] {
  const candidates = [
    ...(citations?.map((c) => c.measureId) ?? []),
    ...charts.flatMap((c) => [c.methodologyId, c.measure]),
  ].filter((m): m is string => Boolean(m))

  const approved = [...new Set(candidates)].filter((m) => APPROVED_MEASURES.has(m))
  if (approved.length) return approved
  return ['active_headcount']
}

/** Build a saveable customized-report partial from wizard chart(s). */
export function buildWizardReportSpec(opts: {
  question: string
  chart?: WizardChartSpec | null | undefined
  charts?: WizardChartSpec[]
  citations?: WizardCitation[]
  filters?: FilterContext | null
}): Partial<CustomizedReportSpec> {
  const charts = (
    opts.charts?.length ? opts.charts : opts.chart ? [opts.chart] : []
  ).filter((c) => c.points?.length)
  const primary = charts[0] ?? null
  const filters = primary?.filters ?? opts.filters ?? EMPTY_FILTER_CONTEXT
  const visuals = charts.map((chart, i) => ({
    id: `wiz-visual-${Date.now()}-${i}`,
    title: chart.title || `Wizard chart ${i + 1}`,
    chart,
    annotations: chart.summary ? [chart.summary] : [],
  }))

  const scope = filters.functions[0]
  const title =
    visuals.length > 1
      ? scope
        ? `${scope} composition report`
        : 'Workforce composition report'
      : primary?.title || 'Wizard report'

  return {
    title,
    description: opts.question.slice(0, 240),
    measures: approvedMeasures(charts, opts.citations),
    dimensions: [...new Set(charts.map((c) => c.dimension).filter(Boolean))],
    filters,
    period: filters.period,
    comparison_mode: filters.comparison,
    visuals,
    tables: [],
    annotations: charts.map((c) => c.summary).filter((s): s is string => Boolean(s)),
    methodology_links: [
      ...new Set(
        charts.map((c) => c.methodologyId).filter((id): id is string => Boolean(id)),
      ),
    ],
    report_type: 'chart',
    created_via_wizard: true,
    status: 'active',
    refresh_behavior: 'on_open',
  }
}
