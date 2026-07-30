import { NextResponse } from 'next/server'
import { FileSourceAdapter, TARGET_TABLES } from '@/lib/ingest/adapter'
import { fetchMappingLookups, promoteTables } from '@/lib/ingest/promote'
import {
  buildPreview,
  mapRows,
  primaryKeyFor,
  validateMappedTables,
} from '@/lib/ingest/validate'
import { requireAdmin, requireSession, authErrorResponse } from '@/lib/auth/guard'
import type { ApiErrorBody, TargetTable } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 120

interface Override {
  sourceLabel: string
  datasetKey: TargetTable
  headerRowIndex?: number
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request)
    await requireAdmin(session, new URL(request.url).pathname)
    const form = await request.formData()
    const files = form.getAll('files').filter((f): f is File => f instanceof File)
    const confirm = String(form.get('confirm') ?? '') === 'true'
    const overridesRaw = String(form.get('overrides') ?? '[]')

    if (!files.length) {
      const body: ApiErrorBody = { error: 'Upload at least one file.' }
      return NextResponse.json(body, { status: 400 })
    }

    let overrides: Override[] = []
    try {
      overrides = JSON.parse(overridesRaw) as Override[]
    } catch {
      overrides = []
    }

    const adapter = new FileSourceAdapter()
    const mappedByKey = new Map<
      TargetTable,
      { rows: Record<string, string>[]; seen: Set<string> }
    >()
    const fileNames: string[] = []

    for (const file of files) {
      fileNames.push(file.name)
      const tables = await adapter.parse(file)
      for (const table of tables) {
        const override = overrides.find((o) => o.sourceLabel === table.sourceLabel)
        const datasetKey = override?.datasetKey
        if (datasetKey && !TARGET_TABLES.includes(datasetKey)) {
          continue
        }
        const preview = buildPreview(
          table,
          datasetKey,
          override?.headerRowIndex,
        )
        if (preview.datasetKey === 'unknown') {
          continue
        }
        const key = preview.datasetKey
        const bucket = mappedByKey.get(key) ?? { rows: [], seen: new Set<string>() }
        const pk = primaryKeyFor(key)
        for (const row of mapRows(table, preview)) {
          if (pk) {
            const pkValue = pk.map((c) => row[c] ?? '').join('||')
            // When a derived-view sheet (e.g. "Currently Open Reqs") repeats keys
            // already loaded from a master sheet, keep the first occurrence so the
            // richer row wins and the merge stays idempotent.
            if (pkValue.replace(/\|/g, '') && bucket.seen.has(pkValue)) continue
            if (pkValue.replace(/\|/g, '')) bucket.seen.add(pkValue)
          }
          bucket.rows.push(row)
        }
        mappedByKey.set(key, bucket)
      }
    }

    const mapped: { datasetKey: TargetTable; rows: Record<string, string>[] }[] =
      [...mappedByKey.entries()].map(([datasetKey, { rows }]) => ({
        datasetKey,
        rows,
      }))

    const lookups = await fetchMappingLookups()
    const validation = validateMappedTables(
      mapped,
      lookups.levels,
      lookups.currencies,
    )

    if (!confirm) {
      return NextResponse.json({ validation, readyToPromote: validation.ok })
    }

    if (!validation.ok) {
      const body: ApiErrorBody = {
        error: 'Validation failed — nothing was loaded.',
        details: validation,
      }
      return NextResponse.json(body, { status: 400 })
    }

    const result = await promoteTables(mapped, fileNames, validation)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && 'status' in error) return authErrorResponse(error)
    const body: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Ingest confirm failed',
    }
    return NextResponse.json(body, { status: 500 })
  }
}
