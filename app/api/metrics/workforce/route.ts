import { NextResponse } from 'next/server'
import { parseFilterContext, readJsonBody } from '@/lib/db/filters'
import { getWorkforcePage } from '@/lib/db/metrics'
import type { ApiErrorBody, FilterContext } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<{ filters?: FilterContext }>(request)
    const data = await getWorkforcePage(parseFilterContext(body.filters))
    return NextResponse.json(data)
  } catch (error) {
    const body: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Workforce metrics failed',
    }
    return NextResponse.json(body, { status: 500 })
  }
}
