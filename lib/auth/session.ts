import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type AppRole,
  type SessionUser,
} from '@/lib/auth/types'

export { SESSION_COOKIE, SESSION_TTL_MS }

const ROLES: AppRole[] = ['admin', 'executive', 'manager', 'viewer']

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (secret && secret.length >= 16) return secret
  // Dev fallback — set SESSION_SECRET in production.
  return 'meridian-bootcamp-dev-session-secret'
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url')
}

function encodeSession(user: SessionUser): string {
  const body = Buffer.from(
    JSON.stringify({
      sid: user.sessionId,
      eid: user.employeeId,
      email: user.workEmail,
      name: user.fullName,
      role: user.appRole,
      exp: user.expiresAt,
    }),
  ).toString('base64url')
  return `${body}.${sign(body)}`
}

function decodeSession(token: string): SessionUser | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = sign(body)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  try {
    const raw = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      sid?: string
      eid?: string
      email?: string
      name?: string
      role?: string
      exp?: number
    }
    if (!raw.sid || !raw.eid || !raw.email || !raw.name || !raw.role || !raw.exp) return null
    if (!ROLES.includes(raw.role as AppRole)) return null
    if (Date.now() > raw.exp) return null
    return {
      sessionId: raw.sid,
      employeeId: raw.eid,
      workEmail: raw.email,
      fullName: raw.name,
      appRole: raw.role as AppRole,
      expiresAt: raw.exp,
    }
  } catch {
    return null
  }
}

export function createSessionToken(input: {
  employeeId: string
  workEmail: string
  fullName: string
  appRole: AppRole
}): { token: string; user: SessionUser } {
  const user: SessionUser = {
    sessionId: randomBytes(16).toString('hex'),
    employeeId: input.employeeId,
    workEmail: input.workEmail,
    fullName: input.fullName,
    appRole: input.appRole,
    expiresAt: Date.now() + SESSION_TTL_MS,
  }
  return { token: encodeSession(user), user }
}

export function verifySessionToken(token: string | undefined | null): SessionUser | null {
  if (!token) return null
  return decodeSession(token)
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies()
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value)
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  }
}
