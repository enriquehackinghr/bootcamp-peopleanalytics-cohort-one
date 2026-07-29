import { randomUUID } from 'crypto'
import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import { getFreshness } from '@/lib/db/metrics'
import type { CustomizedReportSpec, FilterContext } from '@/lib/types'
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

const memoryStore = new Map<string, CustomizedReportSpec>()

export function validateReportSpec(
  spec: Partial<CustomizedReportSpec>,
): { ok: true } | { ok: false; reason: string } {
  for (const m of spec.measures ?? []) {
    if (!APPROVED_MEASURES.has(m)) {
      return {
        ok: false,
        reason: `Unapproved measure "${m}" — report rejected before rendering.`,
      }
    }
  }
  return { ok: true }
}

export async function listReports(): Promise<CustomizedReportSpec[]> {
  if (!hasDatabaseConfig()) {
    return [...memoryStore.values()].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )
  }
  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from('customized_reports')
    .select('*')
    .order('created_at', { ascending: false })
  if (error || !data) {
    return [...memoryStore.values()]
  }
  return data.map(rowToSpec)
}

export async function getReport(id: string): Promise<{
  report: CustomizedReportSpec | null
  dataVersionChanged: boolean
  currentDataLoadId: string | null
}> {
  const freshness = await getFreshness()
  const currentDataLoadId = freshness.lastLoadedAt
  let report: CustomizedReportSpec | null = memoryStore.get(id) ?? null

  if (!report && hasDatabaseConfig()) {
    const supabase = getServiceSupabase()
    const { data } = await supabase
      .from('customized_reports')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (data) report = rowToSpec(data)
  }

  if (!report) {
    return { report: null, dataVersionChanged: false, currentDataLoadId }
  }

  const dataVersionChanged = Boolean(
    report.data_load_id &&
      currentDataLoadId &&
      report.data_load_id !== currentDataLoadId,
  )
  return { report, dataVersionChanged, currentDataLoadId }
}

export async function saveReport(
  input: Partial<CustomizedReportSpec>,
  opts?: { createdBy?: string },
): Promise<{ report?: CustomizedReportSpec; error?: string }> {
  const validation = validateReportSpec(input)
  if (!validation.ok) return { error: validation.reason }

  const freshness = await getFreshness()
  const now = new Date().toISOString()
  const id = input.id || randomUUID()
  const existing = (await getReport(id)).report
  const version = (existing?.version ?? 0) + 1

  const report: CustomizedReportSpec = {
    id,
    title: input.title || 'Untitled report',
    description: input.description || '',
    created_at: existing?.created_at || now,
    created_by: opts?.createdBy || input.created_by || 'wizard',
    source_conversation_id: input.source_conversation_id ?? null,
    source_message_id: input.source_message_id ?? null,
    report_type: input.report_type || 'chart',
    measures: input.measures || [],
    dimensions: input.dimensions || [],
    filters: (input.filters as FilterContext) || EMPTY_FILTER_CONTEXT,
    period: input.period || EMPTY_FILTER_CONTEXT.period,
    comparison_mode: input.comparison_mode || 'none',
    visuals: input.visuals || [],
    tables: input.tables || [],
    annotations: input.annotations || [],
    methodology_links: input.methodology_links || [],
    data_load_id: freshness.lastLoadedAt,
    semantic_model_version: input.semantic_model_version || 'class3-v1',
    risk_methodology_version: input.risk_methodology_version || 'risk-v0.2',
    refresh_behavior: input.refresh_behavior || 'on_open',
    status: input.status || 'active',
    created_via_wizard: input.created_via_wizard ?? true,
    version,
  }

  memoryStore.set(id, report)

  if (hasDatabaseConfig()) {
    const supabase = getServiceSupabase()
    const row = {
      id: report.id,
      title: report.title,
      description: report.description,
      created_at: report.created_at,
      created_by: report.created_by,
      definition: report,
      data_load_id: report.data_load_id,
      semantic_model_version: report.semantic_model_version,
      risk_methodology_version: report.risk_methodology_version,
      status: report.status,
      version: report.version,
      created_via_wizard: report.created_via_wizard,
    }
    await supabase.from('customized_reports').upsert(row)
    await supabase.from('customized_report_versions').insert({
      id: randomUUID(),
      report_id: id,
      version: report.version,
      definition: report,
      created_at: now,
      created_by: report.created_by,
    })
  }

  return { report }
}

export async function refreshReport(
  id: string,
): Promise<{ report?: CustomizedReportSpec; error?: string }> {
  const { report } = await getReport(id)
  if (!report) return { error: 'Report not found' }
  return saveReport({ ...report, id })
}

function rowToSpec(row: Record<string, unknown>): CustomizedReportSpec {
  if (row.definition && typeof row.definition === 'object') {
    return row.definition as CustomizedReportSpec
  }
  return {
    id: String(row.id),
    title: String(row.title ?? 'Report'),
    description: String(row.description ?? ''),
    created_at: String(row.created_at ?? new Date().toISOString()),
    created_by: String(row.created_by ?? 'unknown'),
    source_conversation_id: null,
    source_message_id: null,
    report_type: 'chart',
    measures: [],
    dimensions: [],
    filters: EMPTY_FILTER_CONTEXT,
    period: EMPTY_FILTER_CONTEXT.period,
    comparison_mode: 'none',
    visuals: [],
    tables: [],
    annotations: [],
    methodology_links: [],
    data_load_id: (row.data_load_id as string) ?? null,
    semantic_model_version: String(row.semantic_model_version ?? 'class3-v1'),
    risk_methodology_version: (row.risk_methodology_version as string) ?? 'risk-v0.2',
    refresh_behavior: 'on_open',
    status: (row.status as CustomizedReportSpec['status']) || 'active',
    created_via_wizard: Boolean(row.created_via_wizard),
    version: Number(row.version ?? 1),
  }
}
