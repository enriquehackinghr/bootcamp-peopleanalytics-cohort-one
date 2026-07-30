import { NextResponse } from 'next/server'
import { authErrorResponse, requireMetricContext } from '@/lib/auth/guard'
import { getOrgChart } from '@/lib/db/orgChart'

export async function GET(request: Request) {
  try {
    const ctx = await requireMetricContext({ request, currentRoute: '/org-chart' })
    if (ctx.appRole === 'viewer') {
      return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
    }
    const data = await getOrgChart(ctx)
    return NextResponse.json(data)
  } catch (error) {
    return authErrorResponse(error)
  }
}
