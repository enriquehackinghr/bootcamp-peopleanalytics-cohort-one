import { NextResponse } from 'next/server'
import { getSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session'
import { writeAuditEvent } from '@/lib/auth/audit'

export async function POST() {
  const session = await getSession()
  if (session) {
    await writeAuditEvent({ session, action: 'logout', outcome: 'success' })
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(0), maxAge: 0 })
  return response
}
