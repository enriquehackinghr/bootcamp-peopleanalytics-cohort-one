import { NextResponse } from 'next/server'
import { getEmployee360 } from '@/lib/db/class3'
import type { ApiErrorBody } from '@/lib/types'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  try {
    const { employeeId } = await params
    const data = await getEmployee360(employeeId)
    return NextResponse.json(data)
  } catch (error) {
    const body: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Employee 360 failed',
    }
    return NextResponse.json(body, { status: 500 })
  }
}
