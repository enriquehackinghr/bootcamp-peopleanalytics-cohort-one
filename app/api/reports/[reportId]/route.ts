import { NextResponse } from 'next/server'
import { readJsonBody } from '@/lib/db/filters'
import { getReport, refreshReport } from '@/lib/reports/store'
import type { ApiErrorBody } from '@/lib/types'

export async function GET(
  _request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await context.params
    const result = await getReport(reportId)
    if (!result.report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (error) {
    const body: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Get report failed',
    }
    return NextResponse.json(body, { status: 500 })
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await context.params
    const body = await readJsonBody<{ action?: string }>(request)
    if (body.action === 'refresh') {
      const result = await refreshReport(reportId)
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      return NextResponse.json({ report: result.report })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    const errBody: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Report action failed',
    }
    return NextResponse.json(errBody, { status: 500 })
  }
}
