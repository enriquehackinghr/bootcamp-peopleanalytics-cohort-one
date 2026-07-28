import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import { filtersToJson } from '@/lib/db/filters'
import { METHODOLOGY_FALLBACK } from '@/lib/methodology/catalog'
import type {
  ChartPayload,
  DataFreshness,
  DetailTable,
  FilterContext,
  FilterMetaResponse,
  KpiTile,
  MethodologyResponse,
  MetricDelta,
  PageVisualBundle,
} from '@/lib/types'
import { HIERARCHIES, MIN_CELL_SIZE } from '@/lib/types'

async function rpcNumber(
  fn: string,
  filters: FilterContext,
): Promise<number> {
  if (!hasDatabaseConfig()) return 0
  const supabase = getServiceSupabase()
  const { data, error } = await supabase.rpc(fn, {
    filters: filtersToJson(filters),
  })
  if (error) {
    console.error(`rpc ${fn}`, error.message)
    return 0
  }
  return Number(data ?? 0)
}

export async function getFreshness(): Promise<DataFreshness> {
  if (!hasDatabaseConfig()) {
    return { lastLoadedAt: null, asOfDate: null, sourceSummary: 'Database not configured' }
  }

  const supabase = getServiceSupabase()
  const { data } = await supabase
    .from('data_loads')
    .select('loaded_at, as_of_date, file_names, row_counts')
    .order('loaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) {
    return { lastLoadedAt: null, asOfDate: null, sourceSummary: 'No loads yet' }
  }

  const files = Array.isArray(data.file_names) ? data.file_names.join(', ') : null
  return {
    lastLoadedAt: data.loaded_at,
    asOfDate: data.as_of_date,
    sourceSummary: files,
  }
}

function delta(
  current: number,
  prior: number,
  polarity: MetricDelta['polarity'],
): MetricDelta {
  const absolute = Number((current - prior).toFixed(2))
  const direction = absolute > 0 ? 'up' : absolute < 0 ? 'down' : 'flat'
  const relative =
    prior === 0 ? null : Number((((current - prior) / Math.abs(prior)) * 100).toFixed(1))
  return { absolute, relative, direction, polarity }
}

export async function getFilterMeta(): Promise<FilterMetaResponse> {
  const freshness = await getFreshness()
  if (!hasDatabaseConfig()) {
    return {
      hierarchies: HIERARCHIES,
      functions: [],
      locations: [],
      levelBands: ['IC', 'Manager', 'Director+'],
      tenureBands: ['0-1 years', '1-2 years', '2-5 years', '5+ years'],
      freshness,
      minCellSize: MIN_CELL_SIZE,
    }
  }

  const supabase = getServiceSupabase()
  const [{ data: org }, { data: loc }] = await Promise.all([
    supabase.from('employees').select('function_name, department').limit(5000),
    supabase.from('employees').select('office, country').limit(5000),
  ])

  const functions = [
    ...new Set(
      (org ?? [])
        .map((r) => r.function_name || r.department)
        .filter((v): v is string => Boolean(v)),
    ),
  ].sort()

  const locations = [
    ...new Set(
      (loc ?? [])
        .flatMap((r) => [r.office, r.country])
        .filter((v): v is string => Boolean(v)),
    ),
  ].sort()

  return {
    hierarchies: HIERARCHIES,
    functions,
    locations,
    levelBands: ['IC', 'Manager', 'Director+'],
    tenureBands: ['0-1 years', '1-2 years', '2-5 years', '5+ years'],
    freshness,
    minCellSize: MIN_CELL_SIZE,
  }
}

export async function getExecutiveOverview(
  filters: FilterContext,
): Promise<PageVisualBundle> {
  const freshness = await getFreshness()
  const [
    headcount,
    voluntary,
    openReqs,
    engagement,
    compa,
    flightRisk,
  ] = await Promise.all([
    rpcNumber('active_headcount', filters),
    rpcNumber('voluntary_attrition_rate', filters),
    rpcNumber('open_requisitions', filters),
    rpcNumber('engagement_survey_mean', filters),
    rpcNumber('median_compa_ratio', filters),
    rpcNumber('elevated_flight_risk_count', filters),
  ])

  // Prior-period proxy: empty comparison filters still hit same RPCs;
  // real period shift lands when dim_date snapshots are fully populated.
  const priorFilters: FilterContext = { ...filters, comparison: 'none' }
  const priorHeadcount = await rpcNumber('active_headcount', priorFilters)

  const kpis: KpiTile[] = [
    {
      id: 'active_headcount',
      label: 'Active headcount',
      value: headcount,
      format: 'count',
      delta: delta(headcount, priorHeadcount || headcount, 'higher_is_better'),
      methodologyId: 'active_headcount',
    },
    {
      id: 'voluntary_attrition_rate',
      label: 'Voluntary attrition (TTM)',
      value: voluntary,
      format: 'rate',
      delta: null,
      methodologyId: 'voluntary_attrition_rate',
      unit: '%',
    },
    {
      id: 'open_requisitions',
      label: 'Open requisitions',
      value: openReqs,
      format: 'count',
      delta: null,
      methodologyId: 'open_requisitions',
    },
    {
      id: 'engagement_survey',
      label: 'Engagement (survey)',
      value: engagement,
      format: 'score',
      delta: null,
      methodologyId: 'engagement_survey',
      unit: '1–5',
    },
    {
      id: 'compa_ratio',
      label: 'Median compa-ratio',
      value: Number(compa.toFixed(2)),
      format: 'ratio',
      delta: null,
      methodologyId: 'compa_ratio',
    },
    {
      id: 'elevated_flight_risk',
      label: 'Elevated flight risk',
      value: flightRisk,
      format: 'count',
      delta: null,
      methodologyId: 'elevated_flight_risk',
    },
  ]

  const charts: ChartPayload[] = [
    await compositionByFunctionChart(filters),
    await attritionByTypeChart(filters),
    await funnelChart(filters),
    await engagementByCategoryChart(filters),
  ]

  const table = await employeeDetailTable(filters)

  return {
    pageId: 'executive',
    kpis,
    charts,
    table,
    freshness,
    filterEcho: filters,
  }
}

async function compositionByFunctionChart(
  filters: FilterContext,
): Promise<ChartPayload> {
  if (!hasDatabaseConfig()) {
    return emptyChart(
      'composition_by_function',
      'Composition by function',
      'horizontal_bar',
      'function',
      'active_headcount',
    )
  }

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

  const points = [...counts.entries()]
    .map(([x, y]) => ({ x, y }))
    .sort((a, b) => b.y - a.y)

  return {
    id: 'composition_by_function',
    title: 'Composition by function',
    form: 'horizontal_bar',
    dimension: 'function',
    measure: 'active_headcount',
    points,
    methodologyId: 'active_headcount',
    summary: `Headcount by function; top cut is ${points[0]?.x ?? 'n/a'}.`,
    emptyReason: points.length ? null : 'No employees match the current filters.',
  }
}

async function attritionByTypeChart(filters: FilterContext): Promise<ChartPayload> {
  const [voluntaryRate, involuntary, regrettable] = await Promise.all([
    rpcNumber('voluntary_attrition_rate', filters),
    rpcNumber('involuntary_attrition_count', filters),
    rpcNumber('regrettable_attrition_count', filters),
  ])

  // Voluntary shown as count proxy from rate context — separate series, never blended.
  const voluntaryCount = Math.round(
    (voluntaryRate / 100) * (await rpcNumber('active_headcount', filters)),
  )

  return {
    id: 'attrition_by_type',
    title: 'Attrition by type (TTM)',
    form: 'stacked_bar',
    dimension: 'termination_type',
    measure: 'terminations',
    points: [
      { x: 'TTM', y: voluntaryCount, series: 'Voluntary' },
      { x: 'TTM', y: involuntary, series: 'Involuntary' },
      { x: 'TTM', y: regrettable, series: 'Regrettable' },
    ],
    seriesKeys: ['Voluntary', 'Involuntary', 'Regrettable'],
    methodologyId: 'voluntary_attrition_rate',
    summary:
      'Voluntary, involuntary, and regrettable attrition as three separate series — never blended.',
  }
}

async function funnelChart(filters: FilterContext): Promise<ChartPayload> {
  if (!hasDatabaseConfig()) {
    return emptyChart(
      'recruiting_funnel',
      'Recruiting funnel',
      'stage_bars',
      'stage',
      'event_count',
    )
  }

  const supabase = getServiceSupabase()
  const { data } = await supabase
    .from('mv_funnel_conversion')
    .select('stage_order, stage_name, function_name, event_count')
    .order('stage_order', { ascending: true })
    // schema metrics — supabase may need schema option; fallback query via rpc later
    .limit(100)

  // Prefer direct schema query through RPC-less REST; if matview not exposed, aggregate funnel_events
  let points: { x: string; y: number }[] = []
  if (data && data.length) {
    const byStage = new Map<string, { order: number; n: number }>()
    for (const row of data as {
      stage_order: number
      stage_name: string
      function_name: string | null
      event_count: number
    }[]) {
      if (
        filters.functions.length &&
        row.function_name &&
        !filters.functions.includes(row.function_name)
      ) {
        continue
      }
      const prev = byStage.get(row.stage_name) ?? { order: row.stage_order, n: 0 }
      prev.n += Number(row.event_count)
      byStage.set(row.stage_name, prev)
    }
    points = [...byStage.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([x, v]) => ({ x, y: v.n }))
  } else {
    const { data: events } = await supabase
      .from('funnel_events')
      .select('stage_order, stage_name, event_count')
    const byStage = new Map<string, { order: number; n: number }>()
    for (const row of events ?? []) {
      const prev = byStage.get(row.stage_name) ?? {
        order: row.stage_order,
        n: 0,
      }
      prev.n += Number(row.event_count)
      byStage.set(row.stage_name, prev)
    }
    points = [...byStage.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([x, v]) => ({ x, y: v.n }))
  }

  return {
    id: 'recruiting_funnel',
    title: 'Recruiting funnel',
    form: 'stage_bars',
    dimension: 'stage',
    measure: 'event_count',
    points,
    methodologyId: 'open_requisitions',
    summary: 'Six-stage funnel with conversion readable between adjacent stages.',
    emptyReason: points.length ? null : 'No funnel events loaded.',
  }
}

async function engagementByCategoryChart(
  filters: FilterContext,
): Promise<ChartPayload> {
  if (!hasDatabaseConfig()) {
    return emptyChart(
      'engagement_by_category',
      'Engagement by category',
      'horizontal_bar',
      'category',
      'engagement_survey',
    )
  }

  const supabase = getServiceSupabase()
  const { data } = await supabase
    .from('engagement_responses')
    .select('category, score, function_name, office')

  const sums = new Map<string, { total: number; n: number }>()
  for (const row of data ?? []) {
    if (
      filters.functions.length &&
      row.function_name &&
      !filters.functions.includes(row.function_name)
    ) {
      continue
    }
    if (
      filters.locations.length &&
      row.office &&
      !filters.locations.includes(row.office)
    ) {
      continue
    }
    const cat = row.category || 'Uncategorized'
    const prev = sums.get(cat) ?? { total: 0, n: 0 }
    prev.total += Number(row.score)
    prev.n += 1
    sums.set(cat, prev)
  }

  const points = [...sums.entries()]
    .filter(([, v]) => !suppress(v.n))
    .map(([x, v]) => ({ x, y: Number((v.total / v.n).toFixed(2)) }))
    .sort((a, b) => a.y - b.y)

  const companyMean = await rpcNumber('engagement_survey_mean', filters)

  return {
    id: 'engagement_by_category',
    title: 'Engagement by category (survey 1–5)',
    form: 'horizontal_bar',
    dimension: 'category',
    measure: 'engagement_survey',
    points,
    referenceLines: [{ value: companyMean, label: 'Company mean' }],
    methodologyId: 'engagement_survey',
    unit: '1–5',
    summary: 'Survey instrument only — not plotted with the 0–10 per-employee score.',
    emptyReason: points.length ? null : 'No engagement responses match filters.',
    suppressed: [...sums.values()].some((v) => suppress(v.n)),
  }
}

function suppress(n: number): boolean {
  return n < MIN_CELL_SIZE
}

function emptyChart(
  id: string,
  title: string,
  form: ChartPayload['form'],
  dimension: string,
  measure: string,
): ChartPayload {
  return {
    id,
    title,
    form,
    dimension,
    measure,
    points: [],
    summary: 'No data',
    emptyReason: 'Database not configured or no rows loaded.',
  }
}

async function employeeDetailTable(filters: FilterContext): Promise<DetailTable> {
  if (!hasDatabaseConfig()) {
    return {
      id: 'detail',
      title: 'Detail',
      columns: [
        { key: 'employee_id', label: 'Employee ID' },
        { key: 'function_name', label: 'Function' },
        { key: 'career_level', label: 'Level' },
        { key: 'office', label: 'Office' },
      ],
      rows: [],
    }
  }

  const supabase = getServiceSupabase()
  const { data } = await supabase
    .from('employees')
    .select(
      'employee_id, function_name, department, career_level, office, employment_status',
    )
    .in('employment_status', ['Active', 'active', 'On Leave', 'on leave'])
    .limit(500)

  const rows = (data ?? [])
    .map((r) => ({
      employee_id: r.employee_id as string,
      function_name: (r.function_name || r.department) as string | null,
      career_level: r.career_level as string | null,
      office: r.office as string | null,
    }))
    .filter((r) => {
      if (filters.functions.length && r.function_name && !filters.functions.includes(r.function_name)) {
        return false
      }
      if (filters.locations.length && r.office && !filters.locations.includes(r.office)) {
        return false
      }
      return true
    })

  return {
    id: 'detail',
    title: 'Workforce detail',
    columns: [
      { key: 'employee_id', label: 'Employee ID' },
      { key: 'function_name', label: 'Function' },
      { key: 'career_level', label: 'Level' },
      { key: 'office', label: 'Office' },
    ],
    rows,
  }
}

export async function getWorkforcePage(
  filters: FilterContext,
): Promise<PageVisualBundle> {
  const base = await getExecutiveOverview(filters)
  const [span, managerDebt] = await Promise.all([
    rpcNumber('span_of_control', filters),
    rpcNumber('manager_debt_count', filters),
  ])

  return {
    ...base,
    pageId: 'workforce',
    kpis: [
      ...base.kpis.filter((k) =>
        ['active_headcount', 'elevated_flight_risk'].includes(k.id),
      ),
      {
        id: 'span_of_control',
        label: 'Span of control',
        value: Number(span.toFixed(1)),
        format: 'ratio',
        delta: null,
        methodologyId: 'span_of_control',
      },
      {
        id: 'manager_debt',
        label: 'Manager debt (1 report)',
        value: managerDebt,
        format: 'count',
        delta: null,
        methodologyId: 'span_of_control',
      },
    ],
  }
}

export async function getAttritionPage(
  filters: FilterContext,
): Promise<PageVisualBundle> {
  const freshness = await getFreshness()
  const [voluntary, involuntary, regrettable] = await Promise.all([
    rpcNumber('voluntary_attrition_rate', filters),
    rpcNumber('involuntary_attrition_count', filters),
    rpcNumber('regrettable_attrition_count', filters),
  ])

  return {
    pageId: 'attrition',
    kpis: [
      {
        id: 'voluntary_attrition_rate',
        label: 'Voluntary attrition (TTM)',
        value: voluntary,
        format: 'rate',
        delta: null,
        methodologyId: 'voluntary_attrition_rate',
        unit: '%',
      },
      {
        id: 'involuntary_attrition',
        label: 'Involuntary attrition (TTM)',
        value: involuntary,
        format: 'count',
        delta: null,
        methodologyId: 'involuntary_attrition',
      },
      {
        id: 'regrettable_attrition',
        label: 'Regrettable attrition (TTM)',
        value: regrettable,
        format: 'count',
        delta: null,
        methodologyId: 'regrettable_attrition',
      },
    ],
    charts: [await attritionByTypeChart(filters)],
    table: await employeeDetailTable(filters),
    freshness,
    filterEcho: filters,
  }
}

export async function getCompensationPage(
  filters: FilterContext,
): Promise<PageVisualBundle> {
  const freshness = await getFreshness()
  const [compa, below, market] = await Promise.all([
    rpcNumber('median_compa_ratio', filters),
    rpcNumber('compa_below_090_count', filters),
    rpcNumber('market_position_median', filters),
  ])

  const histogram = await compaHistogram(filters)

  return {
    pageId: 'compensation',
    kpis: [
      {
        id: 'compa_ratio',
        label: 'Median compa-ratio',
        value: Number(compa.toFixed(2)),
        format: 'ratio',
        delta: null,
        methodologyId: 'compa_ratio',
      },
      {
        id: 'compa_below_090',
        label: 'Below 0.90 compa',
        value: below,
        format: 'count',
        delta: null,
        methodologyId: 'compa_ratio',
      },
      {
        id: 'market_position',
        label: 'Median market position',
        value: Number(market.toFixed(2)),
        format: 'ratio',
        delta: null,
        methodologyId: 'market_position',
      },
    ],
    charts: [histogram],
    table: await employeeDetailTable(filters),
    freshness,
    filterEcho: filters,
  }
}

async function compaHistogram(filters: FilterContext): Promise<ChartPayload> {
  if (!hasDatabaseConfig()) {
    return emptyChart(
      'compa_histogram',
      'Compa-ratio distribution',
      'histogram',
      'compa_ratio_bucket',
      'compa_ratio',
    )
  }

  const supabase = getServiceSupabase()
  const { data } = await supabase
    .from('employees')
    .select('compa_ratio, function_name, department, office, employment_status')
    .in('employment_status', ['Active', 'active', 'On Leave', 'on leave'])
    .not('compa_ratio', 'is', null)

  const buckets = new Map<string, number>()
  for (const row of data ?? []) {
    const fn = row.function_name || row.department
    if (filters.functions.length && fn && !filters.functions.includes(fn)) continue
    if (filters.locations.length && row.office && !filters.locations.includes(row.office)) {
      continue
    }
    const ratio = Number(row.compa_ratio)
    const bucket = (Math.floor(ratio * 10) / 10).toFixed(1)
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1)
  }

  const points = [...buckets.entries()]
    .map(([x, y]) => ({ x, y }))
    .sort((a, b) => Number(a.x) - Number(b.x))

  return {
    id: 'compa_histogram',
    title: 'Compa-ratio distribution',
    form: 'histogram',
    dimension: 'compa_ratio_bucket',
    measure: 'compa_ratio',
    points,
    referenceLines: [{ value: 1, label: '1.00 midpoint' }],
    methodologyId: 'compa_ratio',
    summary: 'Diverging around 1.00; count below 0.90 called out in KPIs.',
    emptyReason: points.length ? null : 'No compa-ratio values loaded.',
  }
}

export async function getRecruitingPage(
  filters: FilterContext,
): Promise<PageVisualBundle> {
  const freshness = await getFreshness()
  const [openReqs, ttf, accept] = await Promise.all([
    rpcNumber('open_requisitions', filters),
    rpcNumber('time_to_fill_avg', filters),
    rpcNumber('first_offer_acceptance_rate', filters),
  ])

  return {
    pageId: 'recruiting',
    kpis: [
      {
        id: 'open_requisitions',
        label: 'Open requisitions',
        value: openReqs,
        format: 'count',
        delta: null,
        methodologyId: 'open_requisitions',
      },
      {
        id: 'time_to_fill',
        label: 'Avg time to fill',
        value: Number(ttf.toFixed(0)),
        format: 'days',
        delta: null,
        methodologyId: 'time_to_fill',
        unit: 'days',
      },
      {
        id: 'first_offer_acceptance',
        label: 'First-offer acceptance',
        value: accept,
        format: 'rate',
        delta: null,
        methodologyId: 'first_offer_acceptance',
        unit: '%',
      },
    ],
    charts: [await funnelChart(filters)],
    table: {
      id: 'req_detail',
      title: 'Requisitions',
      columns: [
        { key: 'req_id', label: 'Req ID' },
        { key: 'function_name', label: 'Function' },
        { key: 'outcome', label: 'Outcome' },
        { key: 'office', label: 'Office' },
      ],
      rows: await requisitionRows(filters),
    },
    freshness,
    filterEcho: filters,
  }
}

async function requisitionRows(
  filters: FilterContext,
): Promise<Record<string, string | number | null>[]> {
  if (!hasDatabaseConfig()) return []
  const supabase = getServiceSupabase()
  const { data } = await supabase
    .from('requisitions')
    .select('req_id, function_name, outcome, office')
    .limit(500)

  return (data ?? [])
    .filter((r) => {
      if (filters.functions.length && r.function_name && !filters.functions.includes(r.function_name)) {
        return false
      }
      if (filters.locations.length && r.office && !filters.locations.includes(r.office)) {
        return false
      }
      return true
    })
    .map((r) => ({
      req_id: r.req_id,
      function_name: r.function_name,
      outcome: r.outcome,
      office: r.office,
    }))
}

export async function getEngagementPage(
  filters: FilterContext,
): Promise<PageVisualBundle> {
  const freshness = await getFreshness()
  const [survey, perEmployee] = await Promise.all([
    rpcNumber('engagement_survey_mean', filters),
    rpcNumber('engagement_per_employee_mean', filters),
  ])

  return {
    pageId: 'engagement',
    kpis: [
      {
        id: 'engagement_survey',
        label: 'Survey mean (1–5)',
        value: survey,
        format: 'score',
        delta: null,
        methodologyId: 'engagement_survey',
        unit: '1–5',
      },
      {
        id: 'engagement_per_employee',
        label: 'Per-employee mean (0–10)',
        value: perEmployee,
        format: 'score',
        delta: null,
        methodologyId: 'engagement_per_employee',
        unit: '0–10',
      },
    ],
    charts: [await engagementByCategoryChart(filters)],
    table: {
      id: 'oe_themes',
      title: 'Open-ended themes',
      columns: [
        { key: 'theme', label: 'Theme' },
        { key: 'n', label: 'Count', format: 'count' },
      ],
      rows: await openEndedThemeRows(),
    },
    freshness,
    filterEcho: filters,
  }
}

async function openEndedThemeRows(): Promise<
  Record<string, string | number | null>[]
> {
  if (!hasDatabaseConfig()) return []
  const supabase = getServiceSupabase()
  const { data } = await supabase
    .from('engagement_open_ended')
    .select('theme')
    .limit(2000)

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const theme = row.theme || 'Uncategorized'
    counts.set(theme, (counts.get(theme) ?? 0) + 1)
  }

  return [...counts.entries()]
    .filter(([, n]) => !suppress(n))
    .sort((a, b) => b[1] - a[1])
    .map(([theme, n]) => ({ theme, n }))
}

export async function getMethodology(): Promise<MethodologyResponse> {
  const mappingCaveats = [
    'Market comparisons join through level_map and pay_zone_map — never Meridian pay_zone directly to ACI tier.',
    'Raw salary aggregates convert to USD via fx_rates first; compa-ratio aggregates do not.',
    'A career level that cannot resolve through level_map fails validation at load time.',
  ]
  const engagementInstrumentNotes = [
    'Survey instrument: anonymous Likert 1–5 on engagement_responses.',
    'Per-employee instrument: latest_engagement_score on a 0–10 scale.',
    'Never share an axis, never average the two instruments together.',
  ]

  if (!hasDatabaseConfig()) {
    return {
      entries: METHODOLOGY_FALLBACK,
      mappingCaveats,
      engagementInstrumentNotes,
    }
  }

  const supabase = getServiceSupabase()
  const { data } = await supabase.from('methodology_catalog').select('*').order('name')

  const entries =
    (data as
      | {
          id: string
          name: string
          definition: string
          source_tables: string[]
          notes: string | null
          reconciliation_target: string | null
        }[]
      | null)?.map((row) => ({
      id: row.id,
      name: row.name,
      definition: row.definition,
      sourceTables: row.source_tables,
      notes: row.notes ?? undefined,
      reconciliationTarget: row.reconciliation_target ?? undefined,
    })) ?? []

  return {
    entries: entries.length ? entries : METHODOLOGY_FALLBACK,
    mappingCaveats,
    engagementInstrumentNotes,
  }
}
