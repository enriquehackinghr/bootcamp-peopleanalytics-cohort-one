import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { canAccessEmployee, canAccessRoute } from '@/lib/auth/permissions'
import { buildMetricRequestContext } from '@/lib/auth/context'
import { auditActionForApiPath, writeAuditEvent } from '@/lib/auth/audit'
import type { MetricRequestContext, SessionUser } from '@/lib/auth/types'
import type { FilterContext } from '@/lib/types'

export class AuthError extends Error {
  status: number
  code: string
  constructor(message: string, status = 401, code = 'unauthorized') {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function requireSession(request?: Request): Promise<SessionUser> {
  const session = await getSession()
  if (!session) throw new AuthError('Sign in required', 401, 'unauthorized')

  // Record every authenticated API call when the Request is provided.
  if (request) {
    const pathname = new URL(request.url).pathname
    // Avoid recursive noise from the audit reader/track endpoints.
    if (
      !pathname.startsWith('/api/audit') &&
      !pathname.startsWith('/api/filters/meta') &&
      !pathname.startsWith('/api/auth/session')
    ) {
      void writeAuditEvent({
        session,
        action: auditActionForApiPath(pathname),
        route: pathname,
        outcome: 'success',
      })
    }
  }

  return session
}

export async function requireMetricContext(input?: {
  filters?: FilterContext | null
  currentRoute?: string | null
  selectedEntity?: string | null
  request?: Request
}): Promise<MetricRequestContext> {
  const session = await requireSession(input?.request)
  return buildMetricRequestContext({
    session,
    filters: input?.filters,
    currentRoute: input?.currentRoute,
    selectedEntity: input?.selectedEntity,
  })
}

export async function requireEmployeeAccess(
  ctx: MetricRequestContext,
  employeeId: string,
): Promise<void> {
  if (!canAccessEmployee(ctx.visibleEmployeeIds, employeeId)) {
    await writeAuditEvent({
      session: ctx.session,
      action: 'permission_denial',
      targetType: 'employee',
      targetId: employeeId,
      outcome: 'denied',
      denialReason: 'out_of_scope',
      dataLoadId: ctx.dataLoadId,
    })
    throw new AuthError('Forbidden', 403, 'forbidden')
  }
}

export async function requireAdmin(session: SessionUser, route?: string): Promise<void> {
  if (session.appRole !== 'admin') {
    await writeAuditEvent({
      session,
      action: 'permission_denial',
      route: route ?? null,
      outcome: 'denied',
      denialReason: 'admin_only',
    })
    throw new AuthError('Forbidden', 403, 'forbidden')
  }
}

export function assertRouteAccess(session: SessionUser, pathname: string): void {
  if (!canAccessRoute(session.appRole, pathname)) {
    throw new AuthError('Forbidden', 403, 'forbidden')
  }
}

export function authErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Request failed' },
    { status: 500 },
  )
}
