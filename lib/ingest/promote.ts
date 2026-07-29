import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import type {
  DataLoadRecord,
  IngestConfirmResult,
  TargetTable,
  ValidationReport,
} from '@/lib/types'

const NUMERIC_FIELDS = new Set([
  'base_salary',
  'salary_range_min',
  'salary_range_mid',
  'salary_range_max',
  'compa_ratio',
  'range_penetration',
  'number_of_direct_reports',
  'direct_reports',
  'latest_engagement_score',
  'engagement_score',
  'equity_grant',
  'merit_percent',
  'score',
  'nine_box_x',
  'nine_box_y',
  'scale_min',
  'scale_max',
  'stage_order',
  'event_count',
  'application_count',
  'avg_time_to_fill_days',
  'offer_accept_rate',
  'hires_count',
  'apex_tier',
  'p25',
  'p50',
  'p75',
  'headcount_planned',
  'tenure_months',
  'tenure_months_at_exit',
  'months_since_promotion',
  'org_events_last_6m',
  'compa_ratio_at_exit',
  'fiscal_year',
  'pct_change',
  'notice_days',
  'would_recommend_score',
  'q01',
  'q02',
  'q03',
  'q04',
  'q05',
  'q06',
  'q07',
  'q08',
  'q09',
  'q10',
  'q11',
  'q12',
  'q13',
  'q14',
  'q15',
  'q16',
  'q17',
  'q18',
  'q19',
  'q20',
  'q21',
  'q22',
  'q23',
  'q24',
  'q25',
  'q26',
  'q27',
  'q28',
  'q29',
  'q30',
])

const DATE_FIELDS = new Set([
  'date_of_birth',
  'hire_date',
  'termination_date',
  'event_date',
  'review_date',
  'response_date',
  'open_date',
  'close_date',
  'offer_date',
  'last_promotion_date',
  'vesting_start_date',
  'as_of_date',
  'observation_date',
  'interview_date',
])

const BOOL_FIELDS = new Set([
  'calibration_adjusted',
  'first_offer',
  'is_manager',
])

const CHUNK_SIZE = 100
const MAX_ATTEMPTS = 4

function coerceRow(row: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(row)) {
    if (raw === '' || raw == null) {
      out[key] = null
      continue
    }
    if (NUMERIC_FIELDS.has(key)) {
      const n = Number(String(raw).replace(/,/g, ''))
      out[key] = Number.isFinite(n) ? n : null
      continue
    }
    if (DATE_FIELDS.has(key)) {
      out[key] = raw
      continue
    }
    if (BOOL_FIELDS.has(key)) {
      out[key] = ['true', '1', 'yes', 'y'].includes(String(raw).toLowerCase())
      continue
    }
    out[key] = raw
  }
  return out
}

function errorMessage(error: unknown): string {
  if (!error) return 'Unknown error'
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error
        ? error.cause.message
        : typeof error.cause === 'string'
          ? error.cause
          : null
    return cause ? `${error.message} (${cause})` : error.message
  }
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

function isTransient(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('fetch failed') ||
    m.includes('network') ||
    m.includes('timeout') ||
    m.includes('econnreset') ||
    m.includes('etimedout') ||
    m.includes('socket') ||
    m.includes('503') ||
    m.includes('502') ||
    m.includes('429')
  )
}

async function withRetry<T>(
  label: string,
  run: () => PromiseLike<{
    data: T | null
    error: { message: string } | null
  }>,
): Promise<T | null> {
  let lastMessage = 'Unknown error'
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await run()
      if (!error) return data
      lastMessage = error.message
    } catch (error) {
      lastMessage = errorMessage(error)
    }

    if (!isTransient(lastMessage) || attempt === MAX_ATTEMPTS) {
      throw new Error(`${label}: ${lastMessage}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt))
  }
  throw new Error(`${label}: ${lastMessage}`)
}

async function insertChunks(
  table: TargetTable,
  rows: Record<string, unknown>[],
): Promise<number> {
  const supabase = getServiceSupabase()
  let total = 0
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    await withRetry(
      `Promote failed for ${table} (rows ${i + 1}-${i + chunk.length})`,
      async () => supabase.from(table).insert(chunk),
    )
    total += chunk.length
  }
  return total
}

/** Idempotent promote: replace target table contents with mapped rows (ING-13). */
export async function promoteTables(
  tables: { datasetKey: TargetTable; rows: Record<string, string>[] }[],
  fileNames: string[],
  validation: ValidationReport,
): Promise<IngestConfirmResult> {
  if (!hasDatabaseConfig()) {
    throw new Error('Database is not configured. Set Supabase env vars in .env.local.')
  }
  if (!validation.ok) {
    throw new Error('Cannot promote a failed validation report.')
  }

  const supabase = getServiceSupabase()
  const promoted: Record<string, number> = {}

  // Promote in dependency-friendly order
  const order: TargetTable[] = [
    'competency_framework',
    'engagement_questions',
    'employees',
    'compensation_events',
    'performance_reviews',
    'competency_scores',
    'engagement_responses',
    'engagement_open_ended',
    'recruiters',
    'requisitions',
    'funnel_events',
    'offers',
    'application_sources',
    'market_benchmarks',
    // Class 3 — storage only (PRD 3 views later)
    'employee_snapshots',
    'termination_history',
    'engagement_score_history',
    'engagement_survey_waves',
    'org_events',
    'exit_interviews',
  ]

  const byKey = new Map(tables.map((t) => [t.datasetKey, t]))

  for (const key of order) {
    const table = byKey.get(key)
    if (!table) continue

    const payload = table.rows.map(coerceRow)

    // Clear with a tiny RPC first — large replace payloads commonly surface as
    // undici "fetch failed" against PostgREST.
    await withRetry(`Promote failed for ${key} (clear)`, async () =>
      supabase.rpc('replace_table_rows', {
        target_table: key,
        rows: [],
      }),
    )

    if (key === 'employees') {
      // Two-pass load so chunked inserts don't violate manager self-FKs.
      const managers = payload.map((row) => ({
        employee_id: String(row.employee_id),
        manager_employee_id:
          row.manager_employee_id == null ? null : String(row.manager_employee_id),
      }))
      const withoutManagers = payload.map((row) => ({
        ...row,
        manager_employee_id: null,
      }))
      const total = await insertChunks(key, withoutManagers)
      for (let i = 0; i < managers.length; i += CHUNK_SIZE) {
        const chunk = managers.slice(i, i + CHUNK_SIZE)
        await withRetry(
          `Promote failed for employees (manager links ${i + 1}-${i + chunk.length})`,
          async () => {
            const results = await Promise.all(
              chunk.map((row) =>
                supabase
                  .from('employees')
                  .update({ manager_employee_id: row.manager_employee_id })
                  .eq('employee_id', row.employee_id),
              ),
            )
            const error = results.find((r) => r.error)?.error ?? null
            return { data: null, error }
          },
        )
      }
      promoted[key] = total
      continue
    }

    promoted[key] = await insertChunks(key, payload)
  }

  await withRetry('refresh_materialized', async () =>
    supabase.rpc('refresh_materialized'),
  )

  const asOf = await withRetry<string | null>('reporting_as_of', async () =>
    supabase.rpc('reporting_as_of'),
  )

  const loadRow = {
    source_type: 'file_adapter',
    file_names: fileNames,
    row_counts: promoted,
    validation_summary: `${validation.issues.length} issue(s); ok=${validation.ok}`,
    loaded_by: process.env.INGEST_ACTOR ?? 'admin',
    as_of_date: asOf ?? null,
  }

  const load = await withRetry<Record<string, unknown>>(
    'data_loads insert failed',
    async () =>
      supabase
        .from('data_loads')
        .insert(loadRow)
        .select(
          'id, loaded_at, source_type, file_names, row_counts, validation_summary, loaded_by',
        )
        .single(),
  )

  if (!load) {
    throw new Error('data_loads insert failed: no row returned')
  }

  const record: DataLoadRecord = {
    id: String(load.id),
    loadedAt: String(load.loaded_at),
    sourceType: String(load.source_type),
    fileNames: Array.isArray(load.file_names) ? (load.file_names as string[]) : [],
    rowCounts: (load.row_counts ?? {}) as Record<string, number>,
    validationSummary: String(load.validation_summary ?? ''),
    loadedBy: load.loaded_by == null ? null : String(load.loaded_by),
  }

  return { load: record, promoted }
}

export async function fetchMappingLookups(): Promise<{
  levels: Set<string>
  currencies: Set<string>
}> {
  if (!hasDatabaseConfig()) {
    return {
      levels: new Set([
        'P1',
        'P2',
        'P3',
        'P4',
        'P5',
        'P6',
        'P7',
        'M3',
        'M4',
        'M5',
        'M6',
        'M7',
        'M8',
      ]),
      currencies: new Set(['USD', 'CAD', 'EUR']),
    }
  }

  const supabase = getServiceSupabase()
  const [{ data: levels }, { data: fx }] = await Promise.all([
    supabase.from('level_map').select('meridian_level'),
    supabase.from('fx_rates').select('currency_code'),
  ])

  return {
    levels: new Set((levels ?? []).map((r) => r.meridian_level as string)),
    currencies: new Set((fx ?? []).map((r) => r.currency_code as string)),
  }
}
