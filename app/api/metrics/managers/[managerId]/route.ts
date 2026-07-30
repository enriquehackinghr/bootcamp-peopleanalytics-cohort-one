import { NextResponse } from 'next/server'
import { getManagerDetail } from '@/lib/db/class3'
import { parseFilterContext, readJsonBody } from '@/lib/db/filters'
import {
  authErrorResponse,
  requireEmployeeAccess,
  requireMetricContext,
} from '@/lib/auth/guard'
import type { ApiErrorBody, FilterContext } from '@/lib/types'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ managerId: string }> },
) {
  try {
    const { managerId } = await params
    const body = await readJsonBody<{ filters?: FilterContext }>(request)
    const ctx = await requireMetricContext({
      request,
      filters: body.filters,
      selectedEntity: managerId,
    })
    await requireEmployeeAccess(ctx, managerId)
    const data = await getManagerDetail(managerId, parseFilterContext(body.filters))
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && 'status' in error) return authErrorResponse(error)
    const errBody: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Manager detail failed',
    }
    return NextResponse.json(errBody, { status: 500 })
  }
}
