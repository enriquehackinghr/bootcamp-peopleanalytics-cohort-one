import { NextResponse } from 'next/server'
import { getFilterMeta } from '@/lib/db/metrics'
import type { ApiErrorBody } from '@/lib/types'

export async function GET() {
  try {
    const data = await getFilterMeta()
    return NextResponse.json(data)
  } catch (error) {
    const body: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Failed to load filter meta',
    }
    return NextResponse.json(body, { status: 500 })
  }
}
