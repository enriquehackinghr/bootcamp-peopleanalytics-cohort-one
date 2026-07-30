import { NextResponse } from 'next/server'
import { getRunDetail } from '@/lib/adversarial/store'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params
    const detail = await getRunDetail(runId)
    if (!detail) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }
    return NextResponse.json(detail)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Load run failed' },
      { status: 500 },
    )
  }
}
