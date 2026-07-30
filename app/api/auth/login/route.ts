import { NextResponse } from 'next/server'
import { authenticateByEmail } from '@/lib/auth/login'
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth/session'
import { writeAuditEvent } from '@/lib/auth/audit'
import { SESSION_TTL_MS } from '@/lib/auth/types'
import { readJsonBody } from '@/lib/db/filters'

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<{ email?: string }>(request)
    const email = (body.email ?? '').trim()
    const result = await authenticateByEmail(email)

    if (!result.ok) {
      await writeAuditEvent({
        action: 'login_failed',
        workEmail: email.toLowerCase(),
        outcome: 'denied',
        denialReason: result.reason,
      })
      // Ambiguous identity: same public message, distinct audit reason.
      return NextResponse.json(
        { error: 'That email is not authorized for this dashboard.' },
        { status: 401 },
      )
    }

    const { token, user } = createSessionToken({
      employeeId: result.employeeId,
      workEmail: result.workEmail,
      fullName: result.fullName,
      appRole: result.appRole,
    })

    await writeAuditEvent({
      session: user,
      action: 'login_success',
      outcome: 'success',
    })

    const response = NextResponse.json({
      employeeId: user.employeeId,
      fullName: user.fullName,
      appRole: user.appRole,
      workEmail: user.workEmail,
    })
    response.cookies.set(
      SESSION_COOKIE,
      token,
      sessionCookieOptions(Math.floor(SESSION_TTL_MS / 1000)),
    )
    return response
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Login failed' },
      { status: 500 },
    )
  }
}
