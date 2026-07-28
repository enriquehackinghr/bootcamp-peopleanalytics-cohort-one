import type { RawTable, SourceAdapter, TargetTable } from '@/lib/types'

export const TARGET_TABLES: TargetTable[] = [
  'employees',
  'compensation_events',
  'performance_reviews',
  'competency_scores',
  'engagement_responses',
  'engagement_questions',
  'engagement_open_ended',
  'requisitions',
  'funnel_events',
  'offers',
  'application_sources',
  'recruiters',
  'market_benchmarks',
  'competency_framework',
]

/** Required target columns per dataset (ING validation). */
export const REQUIRED_COLUMNS: Record<TargetTable, string[]> = {
  employees: ['employee_id', 'employment_status'],
  compensation_events: ['event_id', 'employee_id', 'event_date'],
  performance_reviews: ['review_id', 'employee_id'],
  competency_scores: ['review_id', 'competency_id', 'score'],
  engagement_responses: ['response_id', 'survey_period', 'score'],
  engagement_questions: ['question_id', 'category', 'question_text'],
  engagement_open_ended: ['oe_response_id'],
  requisitions: ['req_id'],
  funnel_events: ['req_id', 'stage_order', 'stage_name'],
  offers: ['offer_id', 'req_id'],
  application_sources: ['req_id', 'source'],
  recruiters: ['recruiter_id'],
  market_benchmarks: ['function_name', 'apex_level', 'apex_tier'],
  competency_framework: ['competency_id', 'competency_name'],
}

const DATASET_HINTS: { key: TargetTable; tokens: string[] }[] = [
  { key: 'employees', tokens: ['employee_id', 'employment_status', 'manager_employee_id'] },
  { key: 'compensation_events', tokens: ['event_id', 'merit', 'base_salary'] },
  { key: 'performance_reviews', tokens: ['review_id', 'calibrated_rating', 'review_cycle'] },
  { key: 'competency_scores', tokens: ['competency_id', 'score', 'review_id'] },
  { key: 'engagement_responses', tokens: ['response_id', 'survey_period', 'likert'] },
  { key: 'engagement_questions', tokens: ['question_id', 'question_text', 'category'] },
  { key: 'engagement_open_ended', tokens: ['oe_response_id', 'theme', 'open'] },
  { key: 'requisitions', tokens: ['req_id', 'hiring_manager', 'outcome'] },
  { key: 'funnel_events', tokens: ['stage_order', 'stage_name', 'req_id'] },
  { key: 'offers', tokens: ['offer_id', 'decline_reason'] },
  { key: 'application_sources', tokens: ['application_count', 'source'] },
  { key: 'recruiters', tokens: ['recruiter_id', 'recruiter_name'] },
  { key: 'market_benchmarks', tokens: ['apex_level', 'apex_tier', 'p50'] },
  { key: 'competency_framework', tokens: ['competency_name', 'competency_group'] },
]

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function detectHeaderRowIndex(matrix: string[][]): number {
  const scored = matrix.slice(0, 8).map((row, index) => {
    const normalized = row.map(normalizeHeader)
    let score = 0
    for (const hint of DATASET_HINTS) {
      for (const token of hint.tokens) {
        if (normalized.includes(token)) score += 2
      }
    }
    // Prefer rows that look like headers (many non-empty stringy cells)
    score += normalized.filter((c) => c.length > 0 && /[a-z]/.test(c)).length * 0.25
    return { index, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.score ? scored[0].index : 0
}

export function detectDatasetKey(headers: string[]): {
  key: TargetTable | 'unknown'
  confidence: number
} {
  const normalized = headers.map(normalizeHeader)
  let best: { key: TargetTable | 'unknown'; confidence: number } = {
    key: 'unknown',
    confidence: 0,
  }

  for (const hint of DATASET_HINTS) {
    const hits = hint.tokens.filter((t) => normalized.includes(t)).length
    const confidence = hits / hint.tokens.length
    if (confidence > best.confidence) {
      best = { key: hint.key, confidence }
    }
  }

  return best
}

function cellToString(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(value).trim()
}

function parseCsv(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length)
  return lines.map((line) => {
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
        continue
      }
      if (char === ',' && !inQuotes) {
        cells.push(current.trim())
        current = ''
        continue
      }
      current += char
    }
    cells.push(current.trim())
    return cells
  })
}

export class FileSourceAdapter implements SourceAdapter {
  async parse(source: unknown): Promise<RawTable[]> {
    if (!(source instanceof File) && !(source instanceof Blob)) {
      throw new Error('FileSourceAdapter expects a File or Blob')
    }

    const file = source as File
    const name = 'name' in file ? file.name : 'upload'
    const lower = name.toLowerCase()

    let matrices: { label: string; matrix: string[][] }[] = []

    if (lower.endsWith('.csv')) {
      matrices = [{ label: name, matrix: parseCsv(await file.text()) }]
    } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: 'array',
        cellDates: true,
      })
      matrices = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName]
        const matrix = XLSX.utils
          .sheet_to_json<(string | number | Date | null | undefined)[]>(sheet, {
            header: 1,
            defval: '',
            blankrows: false,
          })
          .map((row) => row.map(cellToString))
        return { label: `${name} :: ${sheetName}`, matrix }
      })
    } else {
      throw new Error('Supported formats: .csv, .xlsx, .xls')
    }

    return matrices
      .filter((m) => m.matrix.length > 0)
      .map((m) => matrixToRawTable(m.label, m.matrix))
  }
}

function matrixToRawTable(sourceLabel: string, matrix: string[][]): RawTable {
  const headerRowIndex = detectHeaderRowIndex(matrix)
  const headers = matrix[headerRowIndex]?.map((h) => h || 'column') ?? []
  const dataRows = matrix.slice(headerRowIndex + 1).filter((row) =>
    row.some((c) => c.trim().length > 0),
  )

  const normalizedHeaders = headers.map(normalizeHeader)
  const { key, confidence } = detectDatasetKey(normalizedHeaders)

  const columns = normalizedHeaders.map((name, i) => ({
    name,
    sampleValues: dataRows.slice(0, 5).map((r) => r[i] ?? ''),
  }))

  const rows = dataRows.map((row) => {
    const obj: Record<string, string> = {}
    normalizedHeaders.forEach((h, i) => {
      obj[h] = row[i] ?? ''
    })
    return obj
  })

  return {
    datasetKey: confidence >= 0.34 ? key : 'unknown',
    sourceLabel,
    headerRowIndex,
    columns,
    rows,
    rowCount: rows.length,
  }
}

export const COLUMN_ALIASES: Record<string, string> = {
  emp_id: 'employee_id',
  id: 'employee_id',
  manager_id: 'manager_employee_id',
  manager: 'manager_employee_id',
  reports_to: 'manager_employee_id',
  status: 'employment_status',
  department: 'department',
  function: 'function_name',
  function_name: 'function_name',
  level: 'career_level',
  career_level: 'career_level',
  term_date: 'termination_date',
  end_date: 'termination_date',
  start_date: 'hire_date',
  currency: 'currency_code',
  pay_zone: 'pay_zone',
  base: 'base_salary',
}
