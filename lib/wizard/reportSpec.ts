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

/** Prefer a chart that already has renderable points. */
export function pickRenderableChart(
  primary: WizardChartSpec | null | undefined,
  fallback: WizardChartSpec | null | undefined,
): WizardChartSpec | null {
  if (primary?.points?.length) return primary
  if (fallback?.points?.length) return fallback
  return primary ?? fallback ?? null
}

export function findLastChartInConversation(
  conversation: WizardConversationTurn[] | undefined,
): WizardChartSpec | null {
  if (!conversation?.length) return null
  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    const chart = conversation[i]?.chart
    if (chart?.points?.length) return chart
  }
  return null
}

function approvedMeasures(
  chart: WizardChartSpec | null,
  citations: WizardCitation[] | undefined,
): string[] {
  const candidates = [
    ...(citations?.map((c) => c.measureId) ?? []),
    chart?.methodologyId,
    chart?.measure,
  ].filter((m): m is string => Boolean(m))

  const approved = [...new Set(candidates)].filter((m) => APPROVED_MEASURES.has(m))
  if (approved.length) return approved
  return ['voluntary_attrition_rate']
}

/** Build a saveable customized-report partial from the wizard chart the user just saw. */
export function buildWizardReportSpec(opts: {
  question: string
  chart: WizardChartSpec | null | undefined
  citations?: WizardCitation[]
  filters?: FilterContext | null
}): Partial<CustomizedReportSpec> {
  const chart = opts.chart ?? null
  const filters = chart?.filters ?? opts.filters ?? EMPTY_FILTER_CONTEXT
  const visuals =
    chart?.points?.length
      ? [
          {
            id: `wiz-visual-${Date.now()}`,
            title: chart.title || 'Wizard chart',
            chart,
            annotations: chart.summary ? [chart.summary] : [],
          },
        ]
      : []

  return {
    title: chart?.title || 'Wizard report',
    description: opts.question.slice(0, 240),
    measures: approvedMeasures(chart, opts.citations),
    dimensions: chart?.dimension ? [chart.dimension] : [],
    filters,
    period: filters.period,
    comparison_mode: filters.comparison,
    visuals,
    tables: [],
    annotations: chart?.summary ? [chart.summary] : [],
    methodology_links: chart?.methodologyId ? [chart.methodologyId] : [],
    report_type: 'chart',
    created_via_wizard: true,
    status: 'active',
    refresh_behavior: 'on_open',
  }
}
