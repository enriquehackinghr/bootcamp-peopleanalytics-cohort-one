import { NextResponse } from 'next/server'
import { readJsonBody } from '@/lib/db/filters'
import { listReports, saveReport } from '@/lib/reports/store'
import type { ApiErrorBody, CustomizedReportSpec } from '@/lib/types'

export async function GET() {
  try {
    const reports = await listReports()
    return NextResponse.json({ reports })
  } catch (error) {
    const body: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'List reports failed',
    }
    return NextResponse.json(body, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<{
      action?: string
      spec?: Partial<CustomizedReportSpec>
      confirm?: boolean
    }>(request)

    if (!body.confirm && body.action?.includes('report')) {
      return NextResponse.json(
        { error: 'Report mutations require explicit confirmation (ACT-2).' },
        { status: 400 },
      )
    }

    const result = await saveReport(body.spec ?? {})
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ id: result.report?.id, report: result.report })
  } catch (error) {
    const errBody: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Save report failed',
    }
    return NextResponse.json(errBody, { status: 500 })
  }
}
