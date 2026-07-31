import { NextResponse } from 'next/server'
import { authErrorResponse, AuthError, requireSession } from '@/lib/auth/guard'
import { getEngagementShiftSignals } from '@/lib/signals/engagementShift'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const session = await requireSession(request)
    if (session.appRole !== 'admin' && session.appRole !== 'executive') {
      throw new AuthError('Forbidden', 403, 'forbidden')
    }
    const data = await getEngagementShiftSignals()
    return NextResponse.json(data)
  } catch (error) {
    return authErrorResponse(error)
  }
}
