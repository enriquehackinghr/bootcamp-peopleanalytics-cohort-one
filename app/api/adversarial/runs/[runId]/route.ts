import { NextResponse } from 'next/server'
import { getRunDetail } from '@/lib/adversarial/store'
import { authErrorResponse, requireAdmin, requireSession } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const { isAdversarialEnabled, featureDisabledResponse } = await import('@/lib/features')
    if (!isAdversarialEnabled()) {
      return NextResponse.json(featureDisabledResponse('Adversarial AI'), { status: 403 })
    }
    const session = await requireSession(request)
    await requireAdmin(session, '/api/adversarial/runs')
    const { runId } = await params
    const detail = await getRunDetail(runId)
    if (!detail) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }
    return NextResponse.json(detail)
  } catch (error) {
    return authErrorResponse(error)
  }
}
