import { NextResponse } from 'next/server'
import { getFilterMeta } from '@/lib/db/metrics'
import { authErrorResponse, requireSession } from '@/lib/auth/guard'
import type { ApiErrorBody } from '@/lib/types'

export async function GET(request: Request) {
  try {
    await requireSession(request)
    const data = await getFilterMeta()
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && 'status' in error) return authErrorResponse(error)
    const body: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Failed to load filter meta',
    }
    return NextResponse.json(body, { status: 500 })
  }
}
