import { NextResponse } from 'next/server'
import { authErrorResponse, requireSession } from '@/lib/auth/guard'
import { buildPlanningRequestContext } from '@/lib/auth/context'
import { getPlanningPage } from '@/lib/db/planning'
import { readJsonBody } from '@/lib/db/filters'

export async function POST(request: Request) {
  try {
    const session = await requireSession(request)
    const body = await readJsonBody<{ growthUpliftPct?: number }>(request)
    const ctx = await buildPlanningRequestContext({
      session,
      scenarioType: 'growth',
    })
    const data = await getPlanningPage(ctx, body.growthUpliftPct ?? 10)
    return NextResponse.json(data)
  } catch (error) {
    return authErrorResponse(error)
  }
}
