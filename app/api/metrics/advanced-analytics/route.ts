import { NextResponse } from 'next/server'
import { getAdvancedAnalyticsPage } from '@/lib/db/class3'
import { parseFilterContext, readJsonBody } from '@/lib/db/filters'
import type { ApiErrorBody, FilterContext } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<{ filters?: FilterContext }>(request)
    const data = await getAdvancedAnalyticsPage(parseFilterContext(body.filters))
    return NextResponse.json(data)
  } catch (error) {
    const body: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Advanced analytics metrics failed',
    }
    return NextResponse.json(body, { status: 500 })
  }
}
