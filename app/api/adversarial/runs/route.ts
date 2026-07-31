import { NextResponse } from 'next/server'
import { listRuns } from '@/lib/adversarial/store'
import { authErrorResponse, requireAdmin, requireSession } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { isAdversarialEnabled, featureDisabledResponse } = await import('@/lib/features')
    if (!isAdversarialEnabled()) {
      return NextResponse.json(featureDisabledResponse('Adversarial AI'), { status: 403 })
    }
    const session = await requireSession(request)
    await requireAdmin(session, '/api/adversarial/runs')
    const runs = await listRuns()
    return NextResponse.json({ runs })
  } catch (error) {
    return authErrorResponse(error)
  }
}
