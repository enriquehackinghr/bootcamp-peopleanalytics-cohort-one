import { NextResponse } from 'next/server'
import { authenticateByEmail } from '@/lib/auth/login'
import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE,
} from '@/lib/auth/session'
import { SESSION_TTL_MS } from '@/lib/auth/types'
import { isStudentShowcase, SHOWCASE_GUEST } from '@/lib/features'

export const dynamic = 'force-dynamic'

/**
 * Open student showcase: mint an executive guest session and redirect in.
 */
export async function GET(request: Request) {
  if (!isStudentShowcase()) {
    return NextResponse.json({ error: 'Guest access is not enabled' }, { status: 404 })
  }

  const url = new URL(request.url)
  const nextPath = url.searchParams.get('next') || '/overview'
  const safeNext =
    nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/overview'

  const auth = await authenticateByEmail(SHOWCASE_GUEST.workEmail)
  const identity = auth.ok
    ? {
        employeeId: auth.employeeId,
        workEmail: auth.workEmail,
        fullName: auth.fullName,
        appRole: auth.appRole,
      }
    : SHOWCASE_GUEST.fallback

  const { token } = createSessionToken(identity)
  const response = NextResponse.redirect(new URL(safeNext, request.url))
  response.cookies.set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(Math.floor(SESSION_TTL_MS / 1000)),
  )
  return response
}
