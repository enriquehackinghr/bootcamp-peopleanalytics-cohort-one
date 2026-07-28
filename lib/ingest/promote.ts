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
  'latest_engagement_score',
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
])

const BOOL_FIELDS = new Set(['calibration_adjusted', 'first_offer'])

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
  ]

  const byKey = new Map(tables.map((t) => [t.datasetKey, t]))

  for (const key of order) {
    const table = byKey.get(key)
    if (!table) continue

    const payload = table.rows.map(coerceRow)
    const chunkSize = 400
    let total = 0

    // Clear once, then insert in chunks via replace for the first chunk
    // and insert for subsequent chunks (replace_table_rows clears each call).
    if (payload.length === 0) {
      const { error } = await supabase.rpc('replace_table_rows', {
        target_table: key,
        rows: [],
      })
      if (error) throw new Error(`Promote failed for ${key}: ${error.message}`)
    } else {
      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize)
        if (i === 0) {
          const { data, error } = await supabase.rpc('replace_table_rows', {
            target_table: key,
            rows: chunk,
          })
          if (error) throw new Error(`Promote failed for ${key}: ${error.message}`)
          total = Number(data ?? chunk.length)
        } else {
          const { error } = await supabase.from(key).insert(chunk)
          if (error) throw new Error(`Promote failed for ${key}: ${error.message}`)
          total += chunk.length
        }
      }
    }

    promoted[key] = total || payload.length
  }

  await supabase.rpc('refresh_materialized')

  const asOf = await supabase.rpc('reporting_as_of')
  const loadRow = {
    source_type: 'file_adapter',
    file_names: fileNames,
    row_counts: promoted,
    validation_summary: `${validation.issues.length} issue(s); ok=${validation.ok}`,
    loaded_by: process.env.INGEST_ACTOR ?? 'admin',
    as_of_date: asOf.data ?? null,
  }

  const { data: load, error: loadError } = await supabase
    .from('data_loads')
    .insert(loadRow)
    .select('id, loaded_at, source_type, file_names, row_counts, validation_summary, loaded_by')
    .single()

  if (loadError || !load) {
    throw new Error(`data_loads insert failed: ${loadError?.message}`)
  }

  const record: DataLoadRecord = {
    id: load.id,
    loadedAt: load.loaded_at,
    sourceType: load.source_type,
    fileNames: load.file_names,
    rowCounts: load.row_counts as Record<string, number>,
    validationSummary: load.validation_summary,
    loadedBy: load.loaded_by,
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
