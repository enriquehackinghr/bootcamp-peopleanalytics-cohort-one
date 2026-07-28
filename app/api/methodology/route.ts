import { NextResponse } from 'next/server'
import { getMethodology } from '@/lib/db/metrics'
import type { ApiErrorBody } from '@/lib/types'

export async function GET() {
  try {
    const data = await getMethodology()
    return NextResponse.json(data)
  } catch (error) {
    const body: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Methodology failed',
    }
    return NextResponse.json(body, { status: 500 })
  }
}
