import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import type { MetricRequestContext } from '@/lib/auth/types'

export type FinderRow = {
  employeeId: string
  fullName: string
  title: string | null
  department: string | null
  functionName: string | null
  managerName: string | null
  managerId: string | null
  location: string | null
  level: string | null
  tenureYears: number | null
  status: string | null
}

export async function searchEmployees(
  ctx: MetricRequestContext,
  query: string,
  filters?: {
    department?: string
    functionName?: string
    level?: string
    location?: string
  },
): Promise<FinderRow[]> {
  if (ctx.visibleEmployeeIds !== 'all' && ctx.visibleEmployeeIds.size === 0) {
    return []
  }
  if (!hasDatabaseConfig()) return []

  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from('employees')
    .select(
      'employee_id, first_name, last_name, department, function_name, career_level, office, employment_status, hire_date, manager_employee_id, job_family',
    )
    .in('employment_status', ['Active', 'active', 'On Leave', 'on leave'])
    .limit(5000)

  if (error || !data) {
    console.error('searchEmployees', error?.message)
    return []
  }

  const nameById = new Map<string, string>()
  for (const row of data) {
    nameById.set(
      row.employee_id as string,
      [row.first_name, row.last_name].filter(Boolean).join(' ') || (row.employee_id as string),
    )
  }

  const q = query.trim().toLowerCase()
  const now = new Date(ctx.reportingBoundary)

  let rows = data.filter((row) => {
    const id = row.employee_id as string
    if (ctx.visibleEmployeeIds !== 'all' && !ctx.visibleEmployeeIds.has(id)) return false

    if (filters?.department && row.department !== filters.department) return false
    if (filters?.functionName && (row.function_name || row.department) !== filters.functionName)
      return false
    if (filters?.level && row.career_level !== filters.level) return false
    if (filters?.location && row.office !== filters.location) return false

    if (q.length < 2) return true
    const hay = [
      row.first_name,
      row.last_name,
      row.employee_id,
      row.department,
      row.function_name,
      row.career_level,
      row.office,
      row.job_family,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })

  rows = rows.slice(0, 100)

  return rows.map((row) => {
    const hire = row.hire_date ? new Date(String(row.hire_date)) : null
    const tenureYears =
      hire && !Number.isNaN(hire.getTime())
        ? Math.round(((now.getTime() - hire.getTime()) / (365.25 * 24 * 3600 * 1000)) * 10) / 10
        : null
    return {
      employeeId: row.employee_id as string,
      fullName:
        [row.first_name, row.last_name].filter(Boolean).join(' ') || (row.employee_id as string),
      title: (row.job_family as string | null) ?? null,
      department: (row.department as string | null) ?? null,
      functionName: (row.function_name as string | null) ?? null,
      managerId: (row.manager_employee_id as string | null) ?? null,
      managerName: row.manager_employee_id
        ? nameById.get(row.manager_employee_id as string) ?? null
        : null,
      location: (row.office as string | null) ?? null,
      level: (row.career_level as string | null) ?? null,
      tenureYears,
      status: (row.employment_status as string | null) ?? null,
    }
  })
}
