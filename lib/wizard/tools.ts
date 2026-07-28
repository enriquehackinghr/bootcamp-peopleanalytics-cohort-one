import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import { filtersToJson } from '@/lib/db/filters'
import type {
  FilterContext,
  WizardChartSpec,
  WizardCitation,
} from '@/lib/types'

export interface WizardToolResult {
  snapshot: Record<string, number>
  citations: WizardCitation[]
  chart: WizardChartSpec | null
  fallbackAnswer: string
}

async function rpc(fn: string, filters: FilterContext): Promise<number> {
  if (!hasDatabaseConfig()) return 0
  const supabase = getServiceSupabase()
  const { data, error } = await supabase.rpc(fn, {
    filters: filtersToJson(filters),
  })
  if (error) {
    console.error('wizard rpc', fn, error.message)
    return 0
  }
  return Number(data ?? 0)
}

export async function runWizardToolQuery(
  question: string,
  filters: FilterContext,
): Promise<WizardToolResult> {
  const q = question.toLowerCase()

  const wantsAttrition = /attrition|turnover|quit|resign|term/.test(q)
  const wantsComp = /compa|pay|salary|compensation|market/.test(q)
  const wantsRecruiting = /requisition|recruit|funnel|offer|time to fill|hire/.test(q)
  const wantsEngagement = /engagement|survey|enps|morale/.test(q)
  const wantsHeadcount = /headcount|how many|workforce|span|manager/.test(q)

  const snapshot: Record<string, number> = {}
  const citations: WizardCitation[] = []

  snapshot.active_headcount = await rpc('active_headcount', filters)
  citations.push({
    measureId: 'active_headcount',
    tables: ['employees'],
  })

  if (wantsAttrition || (!wantsComp && !wantsRecruiting && !wantsEngagement)) {
    snapshot.voluntary_attrition_rate = await rpc('voluntary_attrition_rate', filters)
    snapshot.involuntary_attrition = await rpc('involuntary_attrition_count', filters)
    snapshot.regrettable_attrition = await rpc('regrettable_attrition_count', filters)
    citations.push(
      { measureId: 'voluntary_attrition_rate', tables: ['employees'] },
      { measureId: 'involuntary_attrition', tables: ['employees'] },
      { measureId: 'regrettable_attrition', tables: ['employees', 'performance_reviews'] },
    )
  }

  if (wantsComp) {
    snapshot.median_compa_ratio = await rpc('median_compa_ratio', filters)
    snapshot.compa_below_090 = await rpc('compa_below_090_count', filters)
    snapshot.market_position_median = await rpc('market_position_median', filters)
    citations.push(
      { measureId: 'compa_ratio', tables: ['employees'] },
      {
        measureId: 'market_position',
        tables: ['employees', 'level_map', 'pay_zone_map', 'fx_rates', 'market_benchmarks'],
      },
    )
  }

  if (wantsRecruiting) {
    snapshot.open_requisitions = await rpc('open_requisitions', filters)
    snapshot.time_to_fill_avg = await rpc('time_to_fill_avg', filters)
    snapshot.first_offer_acceptance_rate = await rpc(
      'first_offer_acceptance_rate',
      filters,
    )
    citations.push(
      { measureId: 'open_requisitions', tables: ['requisitions'] },
      { measureId: 'time_to_fill', tables: ['requisitions'] },
      { measureId: 'first_offer_acceptance', tables: ['offers', 'requisitions'] },
    )
  }

  if (wantsEngagement) {
    snapshot.engagement_survey_mean = await rpc('engagement_survey_mean', filters)
    snapshot.engagement_per_employee_mean = await rpc(
      'engagement_per_employee_mean',
      filters,
    )
    citations.push(
      { measureId: 'engagement_survey', tables: ['engagement_responses'] },
      { measureId: 'engagement_per_employee', tables: ['employees'] },
    )
  }

  if (wantsHeadcount) {
    snapshot.span_of_control = await rpc('span_of_control', filters)
    snapshot.elevated_flight_risk = await rpc('elevated_flight_risk_count', filters)
    citations.push(
      { measureId: 'span_of_control', tables: ['employees'] },
      { measureId: 'elevated_flight_risk', tables: ['employees'] },
    )
  }

  let chart: WizardChartSpec | null = null
  if (wantsAttrition) {
    chart = {
      form: 'stacked_bar',
      dimension: 'termination_type',
      measure: 'terminations',
      series: 'type',
      filters,
      title: 'Attrition by type (TTM)',
    }
  } else if (wantsHeadcount) {
    chart = {
      form: 'horizontal_bar',
      dimension: 'function',
      measure: 'active_headcount',
      filters,
      title: 'Active headcount by function',
    }
  }

  const fallbackAnswer = [
    `Active headcount: ${snapshot.active_headcount ?? 0}.`,
    snapshot.voluntary_attrition_rate != null
      ? `Voluntary attrition (TTM): ${snapshot.voluntary_attrition_rate}%.`
      : null,
    snapshot.open_requisitions != null
      ? `Open requisitions: ${snapshot.open_requisitions}.`
      : null,
    snapshot.engagement_survey_mean != null
      ? `Engagement survey mean (1–5): ${snapshot.engagement_survey_mean}. Per-employee mean (0–10): ${snapshot.engagement_per_employee_mean}.`
      : null,
  ]
    .filter(Boolean)
    .join(' ')

  return { snapshot, citations, chart, fallbackAnswer }
}
