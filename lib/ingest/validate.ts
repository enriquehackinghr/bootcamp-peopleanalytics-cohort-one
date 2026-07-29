import {
  COLUMN_ALIASES,
  REQUIRED_COLUMNS,
  normalizeHeader,
} from '@/lib/ingest/adapter'
import type {
  ColumnMapping,
  DatasetPreview,
  RawTable,
  TargetTable,
  ValidationIssue,
  ValidationReport,
} from '@/lib/types'
import { TARGET_TABLES } from '@/lib/ingest/adapter'

const TARGET_FIELD_LISTS: Record<TargetTable, string[]> = {
  employees: [
    'employee_id',
    'first_name',
    'last_name',
    'work_email',
    'date_of_birth',
    'manager_employee_id',
    'employment_status',
    'hire_date',
    'termination_date',
    'termination_type',
    'termination_reason_code',
    'function_name',
    'department',
    'job_family',
    'career_level',
    'job_code',
    'office',
    'country',
    'region',
    'pay_zone',
    'work_arrangement',
    'base_salary',
    'currency_code',
    'salary_range_min',
    'salary_range_mid',
    'salary_range_max',
    'compa_ratio',
    'range_penetration',
    'flight_risk_rating',
    'number_of_direct_reports',
    'latest_engagement_score',
    'talent_designation',
    'last_promotion_date',
    'vesting_start_date',
    'gender',
    'race_ethnicity',
  ],
  compensation_events: [
    'event_id',
    'employee_id',
    'event_date',
    'event_type',
    'base_salary',
    'currency_code',
    'equity_grant',
    'merit_percent',
    'notes',
  ],
  performance_reviews: [
    'review_id',
    'employee_id',
    'reviewer_employee_id',
    'review_cycle',
    'review_date',
    'rating',
    'manager_initial_rating',
    'calibrated_rating',
    'self_rating',
    'calibration_adjusted',
    'promotion_recommendation',
    'nine_box_x',
    'nine_box_y',
  ],
  competency_scores: ['review_id', 'competency_id', 'score'],
  engagement_responses: [
    'response_id',
    'survey_period',
    'response_date',
    'function_name',
    'office',
    'career_level',
    'tenure_band',
    'category',
    'question_id',
    'score',
  ],
  engagement_questions: [
    'question_id',
    'category',
    'question_text',
    'scale_min',
    'scale_max',
  ],
  engagement_open_ended: [
    'oe_response_id',
    'response_id',
    'survey_period',
    'theme',
    'response_text',
  ],
  requisitions: [
    'req_id',
    'title',
    'function_name',
    'career_level',
    'office',
    'hiring_manager_id',
    'recruiter_id',
    'open_date',
    'close_date',
    'outcome',
    'headcount_planned',
  ],
  funnel_events: ['req_id', 'stage_order', 'stage_name', 'event_count'],
  offers: [
    'offer_id',
    'req_id',
    'offer_date',
    'outcome',
    'decline_reason',
    'first_offer',
  ],
  application_sources: ['req_id', 'source', 'application_count'],
  recruiters: [
    'recruiter_id',
    'recruiter_name',
    'avg_time_to_fill_days',
    'offer_accept_rate',
    'hires_count',
  ],
  market_benchmarks: [
    'function_name',
    'apex_level',
    'apex_tier',
    'p25',
    'p50',
    'p75',
    'currency_code',
  ],
  competency_framework: [
    'competency_id',
    'competency_name',
    'competency_group',
    'applies_to',
  ],
  employee_snapshots: [
    'snapshot_id',
    'as_of_date',
    'employee_id',
    'in_employee_master',
    'employment_status',
    'function_name',
    'department',
    'career_level',
    'career_track',
    'job_family',
    'manager_employee_id',
    'office_location',
    'work_country',
    'pay_zone',
    'work_arrangement',
    'currency_code',
    'base_salary',
    'salary_range_mid',
    'compa_ratio',
    'range_penetration',
    'perf_rating',
    'nine_box_placement',
    'engagement_score',
    'flight_risk_rating',
    'tenure_months',
    'direct_reports',
    'months_since_promotion',
    'org_events_last_6m',
  ],
  termination_history: [
    'termination_id',
    'employee_id',
    'in_employee_master',
    'hire_date',
    'termination_date',
    'fiscal_year',
    'termination_type',
    'termination_reason',
    'tenure_months_at_exit',
    'tenure_band_at_exit',
    'function_name',
    'department',
    'career_level',
    'career_track',
    'job_family',
    'office_location',
    'work_country',
    'pay_zone',
    'manager_employee_id',
    'currency_code',
    'compa_ratio_at_exit',
    'last_perf_rating',
    'talent_designation',
    'rehire_eligible',
  ],
  engagement_score_history: [
    'response_id',
    'employee_id',
    'observation_date',
    'engagement_score',
    'instrument',
    'scale_min',
    'scale_max',
    'collection_method',
  ],
  engagement_survey_waves: [
    'response_id',
    'wave_id',
    'wave_label',
    'response_date',
    'function_name',
    'department',
    'level_band',
    'tenure_band',
    'office_location',
    'is_manager',
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
  ],
  org_events: [
    'event_id',
    'employee_id',
    'event_date',
    'event_type',
    'prior_value',
    'new_value',
    'direction',
    'pct_change',
    'reorg_scope',
    'initiated_by',
  ],
  exit_interviews: [
    'interview_id',
    'employee_id',
    'termination_date',
    'interview_date',
    'function_name',
    'career_level',
    'office_location',
    'primary_driver',
    'secondary_driver',
    'notice_days',
    'would_recommend_score',
    'destination_type',
    'regrettable_flag',
    'comment',
  ],
}

export function buildPreview(
  raw: RawTable,
  overrideDataset?: TargetTable,
  overrideHeaderRow?: number,
): DatasetPreview {
  const datasetKey =
    overrideDataset ??
    (TARGET_TABLES.includes(raw.datasetKey as TargetTable)
      ? (raw.datasetKey as TargetTable)
      : 'unknown')

  const sourceColumns = raw.columns.map((c) => c.name)
  const targets =
    datasetKey === 'unknown' ? [] : TARGET_FIELD_LISTS[datasetKey]
  const required =
    datasetKey === 'unknown' ? [] : REQUIRED_COLUMNS[datasetKey]

  const mappings: ColumnMapping[] = targets.map((targetColumn) => {
    const direct = sourceColumns.find((s) => s === targetColumn)
    const aliased = sourceColumns.find(
      (s) => COLUMN_ALIASES[s] === targetColumn || normalizeHeader(s) === targetColumn,
    )
    const sourceColumn = direct ?? aliased ?? null
    return {
      sourceColumn,
      targetColumn,
      required: required.includes(targetColumn),
    }
  })

  const mappedSources = new Set(
    mappings.map((m) => m.sourceColumn).filter(Boolean) as string[],
  )

  return {
    datasetKey,
    sourceLabel: raw.sourceLabel,
    detectedConfidence: datasetKey === 'unknown' ? 0 : 0.8,
    headerRowIndex: overrideHeaderRow ?? raw.headerRowIndex,
    mappings,
    unmappedSourceColumns: sourceColumns.filter((s) => !mappedSources.has(s)),
    missingRequiredTargets: mappings
      .filter((m) => m.required && !m.sourceColumn)
      .map((m) => m.targetColumn),
    sampleRows: raw.rows.slice(0, 5),
    rowCount: raw.rowCount,
  }
}

export function mapRows(
  raw: RawTable,
  preview: DatasetPreview,
): Record<string, string>[] {
  if (preview.datasetKey === 'unknown') return []
  return raw.rows.map((row) => {
    const out: Record<string, string> = {}
    for (const mapping of preview.mappings) {
      if (!mapping.sourceColumn) continue
      out[mapping.targetColumn] = row[mapping.sourceColumn] ?? ''
    }
    return out
  })
}

export function validateMappedTables(
  tables: { datasetKey: TargetTable; rows: Record<string, string>[] }[],
  knownLevels: Set<string>,
  knownCurrencies: Set<string>,
): ValidationReport {
  const issues: ValidationIssue[] = []
  const rowCounts: Record<string, number> = {}
  const employeeIds = new Set<string>()

  for (const table of tables) {
    rowCounts[table.datasetKey] = table.rows.length
    const pk = primaryKeyFor(table.datasetKey)
    const seen = new Set<string>()

    table.rows.forEach((row, index) => {
      const rowNumber = index + 2
      if (pk) {
        const key = pk.map((c) => row[c] ?? '').join('||')
        if (!key.replace(/\|/g, '')) {
          issues.push({
            datasetKey: table.datasetKey,
            severity: 'error',
            rule: 'required_columns',
            rowNumber,
            message: `Missing primary key (${pk.join(', ')})`,
          })
        } else if (seen.has(key)) {
          issues.push({
            datasetKey: table.datasetKey,
            severity: 'error',
            rule: 'primary_key_unique',
            rowNumber,
            message: `Duplicate key ${key}`,
          })
        } else {
          seen.add(key)
        }
      }

      if (table.datasetKey === 'employees') {
        employeeIds.add(row.employee_id)
        if (row.career_level && !knownLevels.has(row.career_level)) {
          issues.push({
            datasetKey: table.datasetKey,
            severity: 'error',
            rule: 'levels_resolvable',
            rowNumber,
            message: `career_level "${row.career_level}" not in level_map`,
          })
        }
        if (row.currency_code && !knownCurrencies.has(row.currency_code)) {
          issues.push({
            datasetKey: table.datasetKey,
            severity: 'error',
            rule: 'currency_codes_known',
            rowNumber,
            message: `currency_code "${row.currency_code}" not in fx_rates`,
          })
        }
      }

      if (
        (table.datasetKey === 'compensation_events' ||
          table.datasetKey === 'performance_reviews') &&
        row.employee_id &&
        employeeIds.size > 0 &&
        !employeeIds.has(row.employee_id)
      ) {
        // FK checked after all tables collected — soft warn here if employees already seen
      }
    })
  }

  const employeeTable = tables.find((t) => t.datasetKey === 'employees')
  const knownEmployees = new Set(
    (employeeTable?.rows ?? []).map((r) => r.employee_id).filter(Boolean),
  )

  for (const table of tables) {
    if (
      table.datasetKey === 'compensation_events' ||
      table.datasetKey === 'performance_reviews'
    ) {
      table.rows.forEach((row, index) => {
        if (row.employee_id && knownEmployees.size && !knownEmployees.has(row.employee_id)) {
          issues.push({
            datasetKey: table.datasetKey,
            severity: 'error',
            rule: 'foreign_keys_resolve',
            rowNumber: index + 2,
            message: `employee_id "${row.employee_id}" not found in employees`,
          })
        }
      })
    }
  }

  const errors = issues.filter((i) => i.severity === 'error')
  return {
    ok: errors.length === 0,
    issues,
    rowCounts,
  }
}

export function primaryKeyFor(dataset: TargetTable): string[] | null {
  switch (dataset) {
    case 'employees':
      return ['employee_id']
    case 'compensation_events':
      return ['event_id']
    case 'performance_reviews':
      return ['review_id']
    case 'competency_scores':
      return ['review_id', 'competency_id']
    case 'engagement_responses':
      return ['response_id']
    case 'engagement_questions':
      return ['question_id']
    case 'engagement_open_ended':
      return ['oe_response_id']
    case 'requisitions':
      return ['req_id']
    case 'funnel_events':
      return ['req_id', 'stage_order']
    case 'offers':
      return ['offer_id']
    case 'application_sources':
      return ['req_id', 'source']
    case 'recruiters':
      return ['recruiter_id']
    case 'market_benchmarks':
      return ['function_name', 'apex_level', 'apex_tier']
    case 'competency_framework':
      return ['competency_id']
    case 'employee_snapshots':
      return ['snapshot_id']
    case 'termination_history':
      return ['termination_id']
    case 'engagement_score_history':
      return ['response_id']
    case 'engagement_survey_waves':
      return ['response_id']
    case 'org_events':
      return ['event_id']
    case 'exit_interviews':
      return ['interview_id']
    default:
      return null
  }
}
