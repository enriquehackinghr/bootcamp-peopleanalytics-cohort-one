import { NextResponse } from 'next/server'
import { getManagerDetail } from '@/lib/db/class3'
import { parseFilterContext, readJsonBody } from '@/lib/db/filters'
import type { ApiErrorBody, FilterContext } from '@/lib/types'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ managerId: string }> },
) {
  try {
    const { managerId } = await params
    const body = await readJsonBody<{ filters?: FilterContext }>(request)
    const data = await getManagerDetail(managerId, parseFilterContext(body.filters))
    return NextResponse.json(data)
  } catch (error) {
    const body: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Manager detail failed',
    }
    return NextResponse.json(body, { status: 500 })
  }
}
