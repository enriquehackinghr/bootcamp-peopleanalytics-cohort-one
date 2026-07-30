import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import type { AppRole } from '@/lib/auth/types'

/** Demo accounts for live class when v4 role column is present or seeded. */
export const DEMO_ROLE_HINTS: Record<string, AppRole> = {
  'amy.gray': 'admin',
  'sarah.lin': 'executive',
  'janet.williams': 'manager',
  'ryan.parsons': 'manager',
  'elaine.williams': 'viewer',
}

export type LoginResult =
  | { ok: true; employeeId: string; workEmail: string; fullName: string; appRole: AppRole }
  | { ok: false; reason: 'not_authorized' | 'ambiguous_identity' | 'inactive' | 'no_database' }

function emailLocalPart(email: string): string {
  return email.trim().toLowerCase().split('@')[0] ?? ''
}

function normalizeRole(value: unknown, email: string): AppRole | null {
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (v === 'admin' || v === 'executive' || v === 'manager' || v === 'viewer') return v
  }
  return DEMO_ROLE_HINTS[emailLocalPart(email)] ?? null
}

export async function authenticateByEmail(rawEmail: string): Promise<LoginResult> {
  const email = rawEmail.trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return { ok: false, reason: 'not_authorized' }
  }
  if (!hasDatabaseConfig()) {
    return { ok: false, reason: 'no_database' }
  }

  const supabase = getServiceSupabase()

  // Prefer exact email match; also try case-insensitive via ilike for safety.
  const { data, error } = await supabase
    .from('employees')
    .select(
      'employee_id, first_name, last_name, work_email, employment_status, app_role, is_active',
    )
    .ilike('work_email', email)

  if (error) {
    // Column may not exist yet — fall back to base columns + demo role hints.
    const fallback = await supabase
      .from('employees')
      .select('employee_id, first_name, last_name, work_email, employment_status')
      .ilike('work_email', email)

    if (fallback.error || !fallback.data) {
      console.error('login lookup', fallback.error?.message ?? error.message)
      return { ok: false, reason: 'not_authorized' }
    }
    return finishLogin(fallback.data as EmployeeRow[], email)
  }

  return finishLogin((data ?? []) as EmployeeRow[], email)
}

type EmployeeRow = {
  employee_id: string
  first_name?: string | null
  last_name?: string | null
  work_email?: string | null
  employment_status?: string | null
  app_role?: string | null
  is_active?: boolean | null
}

function finishLogin(rows: EmployeeRow[], email: string): LoginResult {
  const exact = rows.filter(
    (r) => (r.work_email ?? '').trim().toLowerCase() === email,
  )
  const matches = exact.length > 0 ? exact : rows

  if (matches.length === 0) return { ok: false, reason: 'not_authorized' }
  if (matches.length > 1) return { ok: false, reason: 'ambiguous_identity' }

  const row = matches[0]
  const active =
    row.is_active === true ||
    (row.is_active == null &&
      ['Active', 'active', 'On Leave', 'on leave'].includes(row.employment_status ?? ''))

  if (!active) return { ok: false, reason: 'inactive' }

  const appRole = normalizeRole(row.app_role, email)
  if (!appRole) return { ok: false, reason: 'not_authorized' }

  const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ') || email
  return {
    ok: true,
    employeeId: row.employee_id,
    workEmail: (row.work_email ?? email).trim().toLowerCase(),
    fullName,
    appRole,
  }
}
