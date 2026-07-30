import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import { filtersToJson } from '@/lib/db/filters'
import type {
  ChartSeriesPoint,
  FilterContext,
  WizardChartSpec,
  WizardCitation,
} from '@/lib/types'
import { MIN_CELL_SIZE } from '@/lib/types'

export interface WizardToolResult {
  snapshot: Record<string, number | string>
  citations: WizardCitation[]
  chart: WizardChartSpec | null
  charts: WizardChartSpec[]
  fallbackAnswer: string
  effectiveFilters: FilterContext
  /** When true, UI/LLM should not rewrite the grounded answer. */
  preferAuthoritative: boolean
}

type EmployeeRow = {
  function_name?: string | null
  department?: string | null
  office?: string | null
  country?: string | null
  region?: string | null
  career_level?: string | null
  hire_date?: string | null
  date_of_birth?: string | null
  employment_status?: string | null
}

const FALLBACK_FUNCTIONS = [
  'Engineering',
  'Sales',
  'Customer Success',
  'Marketing',
  'Product',
  'Finance',
  'IT',
  'Data & Analytics',
  'Design',
  'People',
  'Other G&A',
  'Legal',
  'Workplace',
  'Executive',
]

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

async function loadActiveEmployees(): Promise<EmployeeRow[]> {
  if (!hasDatabaseConfig()) return []
  const supabase = getServiceSupabase()
  const { data } = await supabase
    .from('employees')
    .select(
      'function_name, department, employment_status, office, country, region, career_level, hire_date, date_of_birth',
    )
    .in('employment_status', ['Active', 'active', 'On Leave', 'on leave'])
  return (data ?? []) as EmployeeRow[]
}

function functionOf(row: EmployeeRow): string {
  return row.function_name || row.department || 'Unknown'
}

function matchesFunction(row: EmployeeRow, functions: string[]): boolean {
  if (!functions.length) return true
  const fn = functionOf(row)
  return functions.some((f) => f.toLowerCase() === fn.toLowerCase())
}

function countBy(
  rows: EmployeeRow[],
  keyFn: (row: EmployeeRow) => string,
): ChartSeriesPoint[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = keyFn(row) || 'Unknown'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([x, y]) => ({ x, y }))
    .sort((a, b) => b.y - a.y)
}

/** Suppress demographic cuts below min cell size (fold into Other). */
function enforceMinCell(
  points: ChartSeriesPoint[],
  min = MIN_CELL_SIZE,
): ChartSeriesPoint[] {
  const kept: ChartSeriesPoint[] = []
  let other = 0
  for (const p of points) {
    if (p.x === 'Unknown' || p.y < min) other += p.y
    else kept.push(p)
  }
  if (other > 0) kept.push({ x: 'Other / suppressed', y: other })
  return kept.sort((a, b) => b.y - a.y)
}

function ageBand(dob: string | null | undefined, asOf: Date): string {
  if (!dob) return 'Unknown'
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return 'Unknown'
  let years = asOf.getFullYear() - birth.getFullYear()
  const m = asOf.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && asOf.getDate() < birth.getDate())) years -= 1
  if (years < 25) return 'Under 25'
  if (years < 35) return '25–34'
  if (years < 45) return '35–44'
  if (years < 55) return '45–54'
  return '55+'
}

function levelBand(level: string | null | undefined): string {
  if (!level) return 'Unknown'
  if (/^P\d/i.test(level) || /^I{1,3}$|^IV$|^V$|^VI$|^VII$/i.test(level)) return 'IC'
  if (/^M[3-5]/i.test(level) || /SrM|Manager/i.test(level)) return 'Manager'
  return 'Director+'
}

async function resolveFunctionNames(rows: EmployeeRow[]): Promise<string[]> {
  const fromData = [
    ...new Set(rows.map(functionOf).filter((f) => f && f !== 'Unknown')),
  ]
  return fromData.length ? fromData : FALLBACK_FUNCTIONS
}

function parseFunctionFromQuestion(
  question: string,
  knownFunctions: string[],
): string | null {
  const sorted = [...knownFunctions].sort((a, b) => b.length - a.length)
  for (const fn of sorted) {
    const escaped = fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(question)) return fn
  }
  if (/\beng(ineering)?\b/i.test(question)) {
    return (
      knownFunctions.find((f) => /^engineering$/i.test(f)) ?? 'Engineering'
    )
  }
  return null
}

function toWizardChart(
  partial: Omit<WizardChartSpec, 'filters'> & { filters: FilterContext },
): WizardChartSpec {
  return partial
}

export async function runWizardToolQuery(
  question: string,
  filters: FilterContext,
): Promise<WizardToolResult> {
  const q = question.toLowerCase()
  const rows = await loadActiveEmployees()
  const knownFunctions = await resolveFunctionNames(rows)
  const mentionedFunction = parseFunctionFromQuestion(question, knownFunctions)

  const effectiveFilters: FilterContext = {
    ...filters,
    functions: mentionedFunction
      ? [mentionedFunction]
      : filters.functions.length
        ? filters.functions
        : [],
  }

  const wantsAttrition = /attrition|turnover|quit|resign|term(?:ination)?s?\b/.test(
    q,
  )
  const wantsComp = /compa|pay|salary|compensation|market/.test(q)
  const wantsRecruiting =
    /requisition|recruit|funnel|offer|time to fill|hire|open roles?|open reqs?|headcount plan/.test(
      q,
    )
  const wantsEngagement = /engagement|survey|enps|morale/.test(q)
  const wantsLevel = /by level|career level|level band|\blevels?\b/.test(q)
  const wantsGeo =
    /geograph|by (?:location|office|country|region)|location mix|\boffices?\b/.test(
      q,
    )
  const wantsAge = /\bage\b|age band|by age/.test(q)
  const wantsComposition =
    wantsLevel ||
    wantsGeo ||
    wantsAge ||
    /composition|breakdown|headcount by|charts? of/.test(q)
  const wantsHeadcount =
    (/headcount|how many employees|workforce|span|manager debt/.test(q) ||
      wantsComposition ||
      Boolean(mentionedFunction)) &&
    !wantsRecruiting
  const wantsClass3 =
    /hazard|survival|risk band|elevated risk|org event|exit driver|advanced|backtest|readiness|bench/.test(
      q,
    )
  const wantsReport = /save.*(report|chart)|customized report/.test(q)

  const scopedRows = rows.filter((r) =>
    matchesFunction(r, effectiveFilters.functions),
  )
  const companyHeadcount = rows.length
  const scopedHeadcount = scopedRows.length

  const snapshot: Record<string, number | string> = {
    company_active_headcount: companyHeadcount,
    active_headcount: mentionedFunction ? scopedHeadcount : companyHeadcount,
  }
  if (mentionedFunction) {
    snapshot.function_scope = mentionedFunction
    snapshot.scoped_active_headcount = scopedHeadcount
  }

  const citations: WizardCitation[] = [
    { measureId: 'active_headcount', tables: ['employees'] },
  ]

  // Also fetch RPC for consistency with dashboard KPIs when unscoped.
  if (!mentionedFunction) {
    snapshot.active_headcount = await rpc('active_headcount', effectiveFilters)
    snapshot.company_active_headcount = snapshot.active_headcount
  } else {
    snapshot.scoped_active_headcount = await rpc(
      'active_headcount',
      effectiveFilters,
    )
    snapshot.active_headcount = snapshot.scoped_active_headcount
    snapshot.company_active_headcount = await rpc(
      'active_headcount',
      { ...effectiveFilters, functions: [] },
    )
  }

  if (wantsClass3) {
    snapshot.c3_voluntary_attrition_rate = await rpc(
      'c3_voluntary_attrition_rate',
      effectiveFilters,
    )
    snapshot.c3_elevated_risk_headcount = await rpc(
      'c3_elevated_risk_headcount',
      effectiveFilters,
    )
    citations.push(
      {
        measureId: 'c3_voluntary_attrition_rate',
        tables: ['termination_history', 'employee_snapshots'],
      },
      {
        measureId: 'attrition_risk',
        tables: ['employee_snapshots', 'engagement_score_history'],
      },
    )
  }

  if (
    wantsAttrition ||
    (!wantsComp &&
      !wantsRecruiting &&
      !wantsEngagement &&
      !wantsHeadcount &&
      !wantsClass3 &&
      !wantsReport)
  ) {
    snapshot.voluntary_attrition_rate = await rpc(
      'voluntary_attrition_rate',
      effectiveFilters,
    )
    snapshot.involuntary_attrition = await rpc(
      'involuntary_attrition_count',
      effectiveFilters,
    )
    snapshot.regrettable_attrition = await rpc(
      'regrettable_attrition_count',
      effectiveFilters,
    )
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
    snapshot.median_compa_ratio = await rpc('median_compa_ratio', effectiveFilters)
    snapshot.compa_below_090 = await rpc('compa_below_090_count', effectiveFilters)
    snapshot.market_position_median = await rpc(
      'market_position_median',
      effectiveFilters,
    )
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
    snapshot.open_requisitions = await rpc('open_requisitions', effectiveFilters)
    snapshot.time_to_fill_avg = await rpc('time_to_fill_avg', effectiveFilters)
    snapshot.first_offer_acceptance_rate = await rpc(
      'first_offer_acceptance_rate',
      effectiveFilters,
    )
    citations.push(
      { measureId: 'open_requisitions', tables: ['requisitions'] },
      { measureId: 'time_to_fill', tables: ['requisitions'] },
      { measureId: 'first_offer_acceptance', tables: ['offers', 'requisitions'] },
    )
  }

  if (wantsEngagement) {
    snapshot.engagement_survey_mean = await rpc(
      'engagement_survey_mean',
      effectiveFilters,
    )
    snapshot.engagement_per_employee_mean = await rpc(
      'engagement_per_employee_mean',
      effectiveFilters,
    )
    citations.push(
      { measureId: 'engagement_survey', tables: ['engagement_responses'] },
      { measureId: 'engagement_per_employee', tables: ['employees'] },
    )
  }

  if (wantsHeadcount && !wantsComposition) {
    snapshot.span_of_control = await rpc('span_of_control', effectiveFilters)
    snapshot.elevated_flight_risk = await rpc(
      'elevated_flight_risk_count',
      effectiveFilters,
    )
    citations.push(
      { measureId: 'span_of_control', tables: ['employees'] },
      { measureId: 'elevated_flight_risk', tables: ['employees'] },
    )
  }

  const charts: WizardChartSpec[] = []
  const scopeLabel = mentionedFunction ? `${mentionedFunction} ` : ''
  const asOf = new Date()

  if (wantsComposition || (wantsReport && (wantsLevel || wantsGeo || wantsAge))) {
    const dims: Array<'level' | 'geography' | 'age' | 'function'> = []
    if (wantsLevel) dims.push('level')
    if (wantsGeo) dims.push('geography')
    if (wantsAge) dims.push('age')
    if (!dims.length) dims.push('function')

    for (const dim of dims) {
      if (dim === 'level') {
        const points = countBy(scopedRows, (r) => levelBand(r.career_level))
        charts.push(
          toWizardChart({
            form: 'horizontal_bar',
            dimension: 'level_band',
            measure: 'active_headcount',
            filters: effectiveFilters,
            title: `${scopeLabel}headcount by level`.replace(/^./, (c) =>
              c.toUpperCase(),
            ),
            points,
            summary: mentionedFunction
              ? `${mentionedFunction} n=${snapshot.active_headcount}.`
              : `Company n=${snapshot.active_headcount}.`,
            methodologyId: 'active_headcount',
          }),
        )
      } else if (dim === 'geography') {
        const points = countBy(
          scopedRows,
          (r) => r.office || r.country || r.region || 'Unknown',
        )
        charts.push(
          toWizardChart({
            form: 'horizontal_bar',
            dimension: 'location',
            measure: 'active_headcount',
            filters: effectiveFilters,
            title: `${scopeLabel}headcount by geography`.replace(/^./, (c) =>
              c.toUpperCase(),
            ),
            points,
            summary: 'Office / country cuts for the scoped population.',
            methodologyId: 'active_headcount',
          }),
        )
      } else if (dim === 'age') {
        const points = enforceMinCell(
          countBy(scopedRows, (r) => ageBand(r.date_of_birth, asOf)),
        )
        charts.push(
          toWizardChart({
            form: 'horizontal_bar',
            dimension: 'age_band',
            measure: 'active_headcount',
            filters: effectiveFilters,
            title: `${scopeLabel}headcount by age`.replace(/^./, (c) =>
              c.toUpperCase(),
            ),
            points,
            summary: `Demographic cuts suppress cells below n=${MIN_CELL_SIZE}.`,
            methodologyId: 'active_headcount',
          }),
        )
      } else {
        const points = countBy(rows, functionOf).slice(0, 14)
        charts.push(
          toWizardChart({
            form: 'horizontal_bar',
            dimension: 'function',
            measure: 'active_headcount',
            filters: { ...effectiveFilters, functions: [] },
            title: 'Active headcount by function',
            points,
            summary: 'Sorted descending by headcount.',
            methodologyId: 'active_headcount',
          }),
        )
      }
    }
  } else if (wantsAttrition) {
    const headcount = Number(snapshot.active_headcount) || 1
    const voluntaryCount = Math.round(
      ((Number(snapshot.voluntary_attrition_rate) || 0) / 100) * headcount,
    )
    charts.push(
      toWizardChart({
        form: 'stacked_bar',
        dimension: 'termination_type',
        measure: 'terminations',
        series: 'type',
        filters: effectiveFilters,
        title: 'Attrition by type (TTM)',
        seriesKeys: ['Voluntary', 'Involuntary', 'Regrettable'],
        points: [
          { x: 'TTM', y: voluntaryCount, series: 'Voluntary' },
          {
            x: 'TTM',
            y: Number(snapshot.involuntary_attrition) || 0,
            series: 'Involuntary',
          },
          {
            x: 'TTM',
            y: Number(snapshot.regrettable_attrition) || 0,
            series: 'Regrettable',
          },
        ],
        summary: 'Three separate series — never blended.',
        methodologyId: 'voluntary_attrition_rate',
      }),
    )
  } else if (wantsHeadcount) {
    if (mentionedFunction) {
      charts.push(
        toWizardChart({
          form: 'horizontal_bar',
          dimension: 'level_band',
          measure: 'active_headcount',
          filters: effectiveFilters,
          title: `${mentionedFunction} headcount by level`,
          points: countBy(scopedRows, (r) => levelBand(r.career_level)),
          summary: `${mentionedFunction} active headcount: ${snapshot.active_headcount}.`,
          methodologyId: 'active_headcount',
        }),
      )
    } else {
      charts.push(
        toWizardChart({
          form: 'horizontal_bar',
          dimension: 'function',
          measure: 'active_headcount',
          filters: effectiveFilters,
          title: 'Active headcount by function',
          points: countBy(rows, functionOf).slice(0, 14),
          summary: 'Sorted descending by headcount.',
          methodologyId: 'active_headcount',
        }),
      )
    }
  }

  const chart = charts[0] ?? null
  const preferAuthoritative = Boolean(
    mentionedFunction || wantsComposition || wantsReport,
  )

  const headcountLine = mentionedFunction
    ? `Active headcount in ${mentionedFunction} is ${snapshot.active_headcount} (company-wide active headcount is ${snapshot.company_active_headcount}).`
    : `Active headcount: ${snapshot.active_headcount}.`

  const chartLines = charts.map((c) => {
    const top = c.points?.[0]
    return top
      ? `${c.title}: top cut ${top.x} (${top.y}).`
      : `${c.title}: no matching rows.`
  })

  const fallbackAnswer = [
    headcountLine,
    ...chartLines,
    snapshot.voluntary_attrition_rate != null
      ? `Voluntary attrition (TTM): ${snapshot.voluntary_attrition_rate}%.`
      : null,
    snapshot.open_requisitions != null
      ? `Open requisitions: ${snapshot.open_requisitions}.`
      : null,
    snapshot.c3_voluntary_attrition_rate != null
      ? `Class 3 voluntary attrition (TTM): ${snapshot.c3_voluntary_attrition_rate}%.`
      : null,
    snapshot.engagement_survey_mean != null
      ? `Engagement survey mean (1–5): ${snapshot.engagement_survey_mean}.`
      : null,
    snapshot.median_compa_ratio != null
      ? `Median compa-ratio: ${snapshot.median_compa_ratio}.`
      : null,
    wantsAge
      ? `Age cuts use date_of_birth with min cell size n=${MIN_CELL_SIZE}.`
      : null,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    snapshot,
    citations,
    chart,
    charts,
    fallbackAnswer,
    effectiveFilters,
    preferAuthoritative,
  }
}

/** Exported for unit-style checks / answer guarding. */
export function guardFunctionHeadcountAnswer(
  answer: string,
  snapshot: Record<string, number | string>,
  authoritative: string,
): string {
  const fn = snapshot.function_scope
  const scoped = snapshot.scoped_active_headcount ?? snapshot.active_headcount
  const company = snapshot.company_active_headcount
  if (!fn || scoped == null || company == null) return answer
  if (String(scoped) === String(company)) return answer

  const claimsCompanyAsFunction = new RegExp(
    `(?:headcount\\s+(?:in|for)\\s+${String(fn).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${String(fn)}\\s+(?:active\\s+)?headcount)[^\\d]{0,48}${company}\\b`,
    'i',
  ).test(answer)

  const mentionsScoped = String(answer).includes(String(scoped))
  if (claimsCompanyAsFunction || (!mentionsScoped && String(answer).includes(String(company)))) {
    return authoritative
  }
  return answer
}
