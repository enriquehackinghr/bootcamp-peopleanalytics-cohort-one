import { NextResponse } from 'next/server'
import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import { authErrorResponse, requireAdmin, requireSession } from '@/lib/auth/guard'
import type { ApiErrorBody, DataLoadRecord } from '@/lib/types'

export async function GET() {
  try {
    const session = await requireSession()
    await requireAdmin(session)
    if (!hasDatabaseConfig()) {
      const body: ApiErrorBody = { error: 'Database is not configured.' }
      return NextResponse.json(body, { status: 503 })
    }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('data_loads')
      .select(
        'id, loaded_at, source_type, file_names, row_counts, validation_summary, loaded_by',
      )
      .order('loaded_at', { ascending: false })
      .limit(25)

    if (error) {
      const body: ApiErrorBody = { error: error.message }
      return NextResponse.json(body, { status: 500 })
    }

    const loads: DataLoadRecord[] = (data ?? []).map((row) => ({
      id: row.id,
      loadedAt: row.loaded_at,
      sourceType: row.source_type,
      fileNames: Array.isArray(row.file_names) ? row.file_names : [],
      rowCounts: (row.row_counts ?? {}) as Record<string, number>,
      validationSummary: row.validation_summary ?? '',
      loadedBy: row.loaded_by,
    }))

    return NextResponse.json({ loads })
  } catch (error) {
    if (error instanceof Error && 'status' in error) return authErrorResponse(error)
    const body: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Failed to list loads',
    }
    return NextResponse.json(body, { status: 500 })
  }
}
