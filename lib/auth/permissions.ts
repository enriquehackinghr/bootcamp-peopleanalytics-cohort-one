import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import type {
  AppRole,
  FieldClass,
  FieldPermissions,
  SessionUser,
} from '@/lib/auth/types'
import { MIN_CELL_SIZE } from '@/lib/types'

const ROLE_FIELDS: Record<AppRole, FieldPermissions> = {
  admin: {
    identity: true,
    history: true,
    compensation: true,
    equity: true,
    performance: true,
    talent: true,
    promotion_readiness: true,
    succession: true,
    risk: true,
    engagement_individual: true,
    engagement_anonymous: true,
    demographics: true,
    exit: 'full',
    aggregates: true,
    data_upload: true,
    audit_log: true,
  },
  executive: {
    identity: true,
    history: true,
    compensation: true,
    equity: true,
    performance: true,
    talent: true,
    promotion_readiness: true,
    succession: true,
    risk: true,
    engagement_individual: true,
    engagement_anonymous: true,
    demographics: true,
    exit: 'full',
    aggregates: true,
    data_upload: false,
    audit_log: false,
  },
  manager: {
    identity: true,
    history: true,
    compensation: true,
    equity: false,
    performance: true,
    talent: true,
    promotion_readiness: true,
    succession: false,
    risk: true,
    engagement_individual: true,
    engagement_anonymous: true,
    demographics: false,
    exit: 'aggregate',
    aggregates: true,
    data_upload: false,
    audit_log: false,
  },
  viewer: {
    identity: false,
    history: false,
    compensation: false,
    equity: false,
    performance: false,
    talent: false,
    promotion_readiness: false,
    succession: false,
    risk: false,
    engagement_individual: false,
    engagement_anonymous: true,
    demographics: false,
    exit: 'none',
    aggregates: true,
    data_upload: false,
    audit_log: false,
  },
}

export function fieldPermissionsFor(role: AppRole): FieldPermissions {
  return ROLE_FIELDS[role]
}

/**
 * Central scope layer — every protected read must go through this.
 * Current manager_employee_id only; historical managers confer no access.
 */
export async function getVisibleEmployeeIds(
  session: SessionUser,
): Promise<Set<string> | 'all'> {
  if (session.appRole === 'admin' || session.appRole === 'executive') return 'all'
  if (session.appRole === 'viewer') return new Set()
  if (!hasDatabaseConfig()) return new Set([session.employeeId])

  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from('employees')
    .select('employee_id, manager_employee_id')
    .in('employment_status', ['Active', 'active', 'On Leave', 'on leave'])

  if (error || !data) {
    console.error('getVisibleEmployeeIds', error?.message)
    return new Set([session.employeeId])
  }

  const children = new Map<string, string[]>()
  for (const row of data) {
    const mid = row.manager_employee_id as string | null
    if (!mid) continue
    const list = children.get(mid) ?? []
    list.push(row.employee_id as string)
    children.set(mid, list)
  }

  const visible = new Set<string>([session.employeeId])
  const stack = [session.employeeId]
  while (stack.length) {
    const id = stack.pop()!
    for (const child of children.get(id) ?? []) {
      if (!visible.has(child)) {
        visible.add(child)
        stack.push(child)
      }
    }
  }
  return visible
}

export function canAccessEmployee(
  visible: Set<string> | 'all',
  employeeId: string,
): boolean {
  if (visible === 'all') return true
  return visible.has(employeeId)
}

export function canAccessField(
  session: SessionUser,
  employeeId: string,
  fieldClass: FieldClass,
  visible: Set<string> | 'all',
): boolean {
  const perms = fieldPermissionsFor(session.appRole)

  if (fieldClass === 'aggregates') return perms.aggregates
  if (fieldClass === 'data_upload') return perms.data_upload
  if (fieldClass === 'audit_log') return perms.audit_log
  if (fieldClass === 'engagement_anonymous') return perms.engagement_anonymous

  // Individual fields require row visibility (except admin/exec already have all).
  if (session.appRole === 'viewer') return false
  if (!canAccessEmployee(visible, employeeId)) return false

  if (fieldClass === 'exit') return perms.exit === 'full'
  return Boolean(perms[fieldClass as keyof FieldPermissions])
}

export function applySuppression<T extends { n?: number; count?: number }>(
  aggregate: T,
  threshold = MIN_CELL_SIZE,
): T | { suppressed: true; reason: 'n<5' } {
  const n = aggregate.n ?? aggregate.count
  if (typeof n === 'number' && n > 0 && n < threshold) {
    return { suppressed: true, reason: 'n<5' }
  }
  return aggregate
}

export function canSeeIndividuals(role: AppRole): boolean {
  return role === 'admin' || role === 'executive' || role === 'manager'
}

export function canAccessRoute(role: AppRole, pathname: string): boolean {
  if (pathname.startsWith('/admin/quality') || pathname.startsWith('/api/admin/quality')) {
    return role === 'admin' || role === 'executive'
  }
  if (pathname.startsWith('/admin') || pathname.startsWith('/audit')) {
    return role === 'admin'
  }
  if (pathname.startsWith('/signals') || pathname.startsWith('/api/signals')) {
    return role === 'admin' || role === 'executive'
  }
  if (
    pathname.startsWith('/employees') ||
    pathname.startsWith('/find-employees') ||
    pathname.startsWith('/org-chart')
  ) {
    return canSeeIndividuals(role)
  }
  return true
}
