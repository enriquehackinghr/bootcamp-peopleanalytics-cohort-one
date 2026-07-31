/**
 * One-shot reload of performance reviews from the Meridian Class 1–2 workbook,
 * applying the Class 5 column aliases (effective_date→review_date, etc.).
 */
import fs from 'fs'
import path from 'path'
import { FileSourceAdapter } from '../lib/ingest/adapter'
import { buildPreview, mapRows, validateMappedTables } from '../lib/ingest/validate'
import { promoteTables } from '../lib/ingest/promote'
import type { TargetTable } from '../lib/types'

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

async function main() {
  loadEnvLocal()

  const filePath =
    process.argv[2] ||
    path.join(
      process.env.USERPROFILE || '',
      'OneDrive',
      'Desktop',
      'Materials',
      'Meridian Analytics',
      'Class 1-2 Data',
      'meridian_performance_review_history.xlsx',
    )

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const buf = fs.readFileSync(filePath)
  const file = new File([buf], path.basename(filePath), {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const adapter = new FileSourceAdapter()
  const rawTables = await adapter.parse(file)
  console.log(
    'Detected tables:',
    rawTables.map((t) => `${t.datasetKey} (${t.rowCount})`).join(', '),
  )

  const mapped = rawTables
    .filter((t) => t.datasetKey === 'performance_reviews')
    .map((raw) => {
      const preview = buildPreview(raw)
      console.log(
        'Mappings:',
        preview.mappings
          .filter((m) => m.sourceColumn)
          .map((m) => `${m.sourceColumn} → ${m.targetColumn}`)
          .join(', '),
      )
      console.log('Unmapped:', preview.unmappedSourceColumns.join(', '))
      return {
        datasetKey: preview.datasetKey as TargetTable,
        rows: mapRows(raw, preview),
      }
    })

  if (mapped.length === 0 || mapped[0].rows.length === 0) {
    throw new Error('No performance_reviews rows mapped')
  }

  const sample = mapped[0].rows.find((r) => r.employee_id === 'E10106')
  console.log('E10106 mapped sample:', sample)

  const validation = validateMappedTables(mapped, new Set(), new Set())
  if (!validation.ok) {
    console.error(
      'Validation errors:',
      validation.issues.filter((i) => i.severity === 'error').slice(0, 10),
    )
    throw new Error('Validation failed')
  }

  const result = await promoteTables(mapped, [path.basename(filePath)], validation)
  console.log('Promoted:', result)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
