import { NextResponse } from 'next/server'
import { parseFilterContext, readJsonBody } from '@/lib/db/filters'
import { getExecutiveOverview } from '@/lib/db/metrics'
import type { ApiErrorBody, FilterContext } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<{ filters?: FilterContext }>(request)
    const filters = parseFilterContext(body.filters)
    const data = await getExecutiveOverview(filters)
    return NextResponse.json(data)
  } catch (error) {
    const body: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Executive overview failed',
    }
    return NextResponse.json(body, { status: 500 })
  }
}
