import { NextResponse } from 'next/server'
import { parseFilterContext, readJsonBody } from '@/lib/db/filters'
import { getEngagementPage } from '@/lib/db/metrics'
import { authErrorResponse, requireSession } from '@/lib/auth/guard'
import type { ApiErrorBody, FilterContext } from '@/lib/types'

export async function POST(request: Request) {
  try {
    await requireSession(request)
    const body = await readJsonBody<{ filters?: FilterContext }>(request)
    const data = await getEngagementPage(parseFilterContext(body.filters))
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && 'status' in error) return authErrorResponse(error)
    const body: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Engagement metrics failed',
    }
    return NextResponse.json(body, { status: 500 })
  }
}
