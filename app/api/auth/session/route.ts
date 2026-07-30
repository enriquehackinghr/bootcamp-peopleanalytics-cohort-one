import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getVisibleEmployeeIds } from '@/lib/auth/permissions'
import { resolveReportingBoundary } from '@/lib/auth/context'
import { authErrorResponse, AuthError } from '@/lib/auth/guard'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) throw new AuthError('Sign in required', 401)

    const [visible, boundary] = await Promise.all([
      getVisibleEmployeeIds(session),
      resolveReportingBoundary(),
    ])

    const visibleCount = visible === 'all' ? 820 : visible.size

    return NextResponse.json({
      employeeId: session.employeeId,
      fullName: session.fullName,
      workEmail: session.workEmail,
      appRole: session.appRole,
      visibleEmployeeCount: visibleCount,
      reportingBoundary: boundary.reportingBoundary,
      dataLoadId: boundary.dataLoadId,
      expiresAt: session.expiresAt,
    })
  } catch (error) {
    return authErrorResponse(error)
  }
}
