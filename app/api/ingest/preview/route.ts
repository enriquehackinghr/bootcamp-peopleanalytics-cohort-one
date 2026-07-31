import { NextResponse } from 'next/server'
import { FileSourceAdapter } from '@/lib/ingest/adapter'
import { buildPreview } from '@/lib/ingest/validate'
import { authErrorResponse, requireAdmin, requireSession } from '@/lib/auth/guard'
import type { ApiErrorBody, DatasetPreview } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const { isDataUploadEnabled, featureDisabledResponse } = await import('@/lib/features')
    if (!isDataUploadEnabled()) {
      return NextResponse.json(featureDisabledResponse('Data upload'), { status: 403 })
    }
    const session = await requireSession(request)
    await requireAdmin(session, new URL(request.url).pathname)
    const form = await request.formData()
    const files = form.getAll('files').filter((f): f is File => f instanceof File)

    if (!files.length) {
      const body: ApiErrorBody = { error: 'Upload at least one .csv or .xlsx file.' }
      return NextResponse.json(body, { status: 400 })
    }

    const adapter = new FileSourceAdapter()
    const previews: DatasetPreview[] = []

    for (const file of files) {
      const tables = await adapter.parse(file)
      for (const table of tables) {
        previews.push(buildPreview(table))
      }
    }

    return NextResponse.json({ previews })
  } catch (error) {
    if (error instanceof Error && 'status' in error) return authErrorResponse(error)
    const body: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Ingest preview failed',
    }
    return NextResponse.json(body, { status: 500 })
  }
}
