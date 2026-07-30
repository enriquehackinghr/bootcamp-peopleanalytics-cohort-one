import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import type { MetricRequestContext } from '@/lib/auth/types'

/** PRD §5.3 — single org root at the CEO. */
export const CEO_EMPLOYEE_ID = 'E10001'

export type OrgChartNode = {
  employeeId: string
  fullName: string
  title: string | null
  department: string | null
  functionName: string | null
  level: string | null
  location: string | null
  /** Direct reports only */
  directReportCount: number
  /** All descendants (current tree) */
  teamSize: number
  children: OrgChartNode[]
}

export type OrgChartResponse = {
  rootEmployeeId: string
  rootMode: 'company' | 'manager'
  reportingBoundary: string
  dataLoadId: string | null
  nodeCount: number
  tree: OrgChartNode | null
  note: string
}

type EmpRow = {
  employee_id: string
  first_name: string | null
  last_name: string | null
  manager_employee_id: string | null
  department: string | null
  function_name: string | null
  career_level: string | null
  office: string | null
  job_family: string | null
}

function fullName(row: EmpRow): string {
  return [row.first_name, row.last_name].filter(Boolean).join(' ') || row.employee_id
}

function buildTree(
  rootId: string,
  byId: Map<string, EmpRow>,
  childrenOf: Map<string, string[]>,
  visible: Set<string> | 'all',
): OrgChartNode | null {
  const row = byId.get(rootId)
  if (!row) return null
  if (visible !== 'all' && !visible.has(rootId)) return null

  function walk(id: string): OrgChartNode | null {
    const emp = byId.get(id)
    if (!emp) return null
    if (visible !== 'all' && !visible.has(id)) return null

    const childIds = (childrenOf.get(id) ?? []).filter(
      (cid) => visible === 'all' || visible.has(cid),
    )
    const children = childIds
      .map((cid) => walk(cid))
      .filter((n): n is OrgChartNode => Boolean(n))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))

    const teamSize = children.reduce((sum, c) => sum + 1 + c.teamSize, 0)

    return {
      employeeId: emp.employee_id,
      fullName: fullName(emp),
      title: emp.job_family,
      department: emp.department,
      functionName: emp.function_name,
      level: emp.career_level,
      location: emp.office,
      directReportCount: children.length,
      teamSize,
      children,
    }
  }

  return walk(rootId)
}

/**
 * Current reporting tree only (PRD §7.2 / §7.9).
 * admin/executive → rooted at CEO; manager → rooted at self.
 */
export async function getOrgChart(ctx: MetricRequestContext): Promise<OrgChartResponse> {
  const note =
    'Current reporting lines only. Historical manager changes do not appear and confer no access.'

  const empty = (rootMode: 'company' | 'manager', rootEmployeeId: string): OrgChartResponse => ({
    rootEmployeeId,
    rootMode,
    reportingBoundary: ctx.reportingBoundary,
    dataLoadId: ctx.dataLoadId,
    nodeCount: 0,
    tree: null,
    note,
  })

  if (ctx.appRole === 'viewer') {
    return empty('company', CEO_EMPLOYEE_ID)
  }

  const rootMode = ctx.appRole === 'manager' ? 'manager' : 'company'
  const rootEmployeeId =
    rootMode === 'manager' ? ctx.session.employeeId : CEO_EMPLOYEE_ID

  if (!hasDatabaseConfig()) return empty(rootMode, rootEmployeeId)

  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from('employees')
    .select(
      'employee_id, first_name, last_name, manager_employee_id, department, function_name, career_level, office, job_family',
    )
    .in('employment_status', ['Active', 'active', 'On Leave', 'on leave'])
    .limit(5000)

  if (error || !data) {
    console.error('getOrgChart', error?.message)
    return empty(rootMode, rootEmployeeId)
  }

  const byId = new Map<string, EmpRow>()
  const childrenOf = new Map<string, string[]>()
  for (const raw of data) {
    const row = raw as EmpRow
    byId.set(row.employee_id, row)
    const mid = row.manager_employee_id
    if (!mid) continue
    const list = childrenOf.get(mid) ?? []
    list.push(row.employee_id)
    childrenOf.set(mid, list)
  }

  // If CEO id missing from this load, fall back to the employee with no manager.
  let rootId = rootEmployeeId
  if (rootMode === 'company' && !byId.has(rootId)) {
    const orphan = [...byId.values()].find((r) => !r.manager_employee_id)
    if (orphan) rootId = orphan.employee_id
  }

  const visible = ctx.visibleEmployeeIds
  const tree = buildTree(rootId, byId, childrenOf, visible)

  function countNodes(node: OrgChartNode | null): number {
    if (!node) return 0
    return 1 + node.children.reduce((s, c) => s + countNodes(c), 0)
  }

  return {
    rootEmployeeId: rootId,
    rootMode,
    reportingBoundary: ctx.reportingBoundary,
    dataLoadId: ctx.dataLoadId,
    nodeCount: countNodes(tree),
    tree,
    note,
  }
}
