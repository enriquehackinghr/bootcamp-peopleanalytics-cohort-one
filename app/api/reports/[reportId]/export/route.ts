import { NextResponse } from 'next/server'
import { exportReport } from '@/lib/reports/store'
import { authErrorResponse, requireSession } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  try {
    await requireSession(request)
    const { reportId } = await context.params
    const result = await exportReport(reportId)
    if ('error' in result) {
      return NextResponse.json(result, { status: 400 })
    }
    return new NextResponse(result.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      },
    })
  } catch (error) {
    return authErrorResponse(error)
  }
}
