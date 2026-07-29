import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import { filtersToJson } from '@/lib/db/filters'
import type {
  ChartSeriesPoint,
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

async function headcountByFunction(
  filters: FilterContext,
): Promise<ChartSeriesPoint[]> {
  if (!hasDatabaseConfig()) return []
  const supabase = getServiceSupabase()
  const { data } = await supabase
    .from('employees')
    .select('function_name, department, employment_status')
    .in('employment_status', ['Active', 'active', 'On Leave', 'on leave'])
  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const fn = row.function_name || row.department || 'Unknown'
    if (filters.functions.length && !filters.functions.includes(fn)) continue
    counts.set(fn, (counts.get(fn) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([x, y]) => ({ x, y }))
    .sort((a, b) => b.y - a.y)
    .slice(0, 14)
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
      {
        measureId: 'regrettable_attrition',
        tables: ['employees', 'performance_reviews'],
      },
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
        tables: [
          'employees',
          'level_map',
          'pay_zone_map',
          'fx_rates',
          'market_benchmarks',
        ],
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
    const headcount = snapshot.active_headcount || 1
    const voluntaryCount = Math.round(
      ((snapshot.voluntary_attrition_rate ?? 0) / 100) * headcount,
    )
    chart = {
      form: 'stacked_bar',
      dimension: 'termination_type',
      measure: 'terminations',
      series: 'type',
      filters,
      title: 'Attrition by type (TTM)',
      seriesKeys: ['Voluntary', 'Involuntary', 'Regrettable'],
      points: [
        { x: 'TTM', y: voluntaryCount, series: 'Voluntary' },
        {
          x: 'TTM',
          y: snapshot.involuntary_attrition ?? 0,
          series: 'Involuntary',
        },
        {
          x: 'TTM',
          y: snapshot.regrettable_attrition ?? 0,
          series: 'Regrettable',
        },
      ],
      summary: 'Three separate series — never blended.',
      methodologyId: 'voluntary_attrition_rate',
    }
  } else if (wantsHeadcount) {
    chart = {
      form: 'horizontal_bar',
      dimension: 'function',
      measure: 'active_headcount',
      filters,
      title: 'Active headcount by function',
      points: await headcountByFunction(filters),
      summary: 'Sorted descending by headcount.',
      methodologyId: 'active_headcount',
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
