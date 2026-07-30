import { NextResponse } from 'next/server'
import { listRuns } from '@/lib/adversarial/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const runs = await listRuns()
    return NextResponse.json({ runs })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'List runs failed' },
      { status: 500 },
    )
  }
}
