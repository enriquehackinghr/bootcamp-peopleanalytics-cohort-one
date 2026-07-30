import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import type { PlanningRequestContext } from '@/lib/auth/types'
import { getFreshness } from '@/lib/db/metrics'

export type PlanVsActualRow = {
  functionName: string
  fiscalQuarter: string
  plannedHeadcount: number | null
  actualHeadcount: number | null
  planVariance: number | null
  headcountAttainment: number | null
  plannedHires: number | null
  completedHires: number | null
  hiringAttainment: number | null
}

export type PlanningPageResponse = {
  reportingBoundary: string
  dataLoadId: string | null
  reconciliation: {
    plannedFy26Hires: number | null
    completedHiresThroughBoundary: number | null
    actualHeadcountAtBoundary: number | null
    payrollRunRate: number | null
    approvedBudget: number | null
  }
  planVsActual: PlanVsActualRow[]
  growthScenario: {
    hiringUpliftPct: number
    projectedFyeHeadcount: number | null
    bindingConstraint: string | null
    note: string
  }
  calculationMethodVersion: string
  freshness: Awaited<ReturnType<typeof getFreshness>>
}

export async function getPlanningPage(
  ctx: PlanningRequestContext,
  growthUpliftPct = 10,
): Promise<PlanningPageResponse> {
  const freshness = await getFreshness()
  const empty: PlanningPageResponse = {
    reportingBoundary: ctx.reportingBoundary,
    dataLoadId: ctx.dataLoadId,
    reconciliation: {
      plannedFy26Hires: null,
      completedHiresThroughBoundary: null,
      actualHeadcountAtBoundary: null,
      payrollRunRate: null,
      approvedBudget: null,
    },
    planVsActual: [],
    growthScenario: {
      hiringUpliftPct: growthUpliftPct,
      projectedFyeHeadcount: null,
      bindingConstraint: null,
      note: 'Assumption-based scenario — not an AI prediction.',
    },
    calculationMethodVersion: ctx.calculationMethodVersion,
    freshness,
  }

  if (!hasDatabaseConfig()) return empty

  const supabase = getServiceSupabase()

  const { count: activeCount } = await supabase
    .from('employees')
    .select('employee_id', { count: 'exact', head: true })
    .in('employment_status', ['Active', 'active', 'On Leave', 'on leave'])

  const { data: salaryRows } = await supabase
    .from('employees')
    .select('base_salary, function_name, department')
    .in('employment_status', ['Active', 'active', 'On Leave', 'on leave'])
    .limit(5000)

  const payrollRunRate = (salaryRows ?? []).reduce(
    (sum, r) => sum + (Number(r.base_salary) || 0),
    0,
  )

  const byFunction = new Map<string, { headcount: number; payroll: number }>()
  for (const row of salaryRows ?? []) {
    const fn = (row.function_name || row.department || 'Unknown') as string
    const cur = byFunction.get(fn) ?? { headcount: 0, payroll: 0 }
    cur.headcount += 1
    cur.payroll += Number(row.base_salary) || 0
    byFunction.set(fn, cur)
  }

  const { data: budgetRows } = await supabase.from('fy26_comp_budget').select('*').limit(500)
  const approvedBudget = (budgetRows ?? []).reduce(
    (sum, r) => sum + (Number((r as { approved_base_salary_budget?: number }).approved_base_salary_budget) || 0),
    0,
  )

  const { count: openReqs } = await supabase
    .from('requisitions')
    .select('requisition_id', { count: 'exact', head: true })
    .ilike('status', 'open')

  const planVsActual: PlanVsActualRow[] = [...byFunction.entries()]
    .sort((a, b) => b[1].headcount - a[1].headcount)
    .slice(0, 12)
    .map(([functionName, stats]) => {
      // Without fy26_headcount_plan loaded, planned values stay null (never coerced to 0).
      const plannedHeadcount: number | null = null
      const plannedHires: number | null = null
      return {
        functionName,
        fiscalQuarter: 'YTD',
        plannedHeadcount,
        actualHeadcount: stats.headcount,
        planVariance: plannedHeadcount == null ? null : stats.headcount - plannedHeadcount,
        headcountAttainment:
          plannedHeadcount == null || plannedHeadcount === 0
            ? null
            : stats.headcount / plannedHeadcount,
        plannedHires,
        completedHires: null,
        hiringAttainment: null,
      }
    })

  const actual = activeCount ?? null
  const projected =
    actual == null ? null : Math.round(actual * (1 + growthUpliftPct / 100))

  let bindingConstraint: string | null = null
  if ((openReqs ?? 0) > 0 && growthUpliftPct > 15) {
    bindingConstraint = 'recruiter_capacity'
  }

  return {
    reportingBoundary: ctx.reportingBoundary,
    dataLoadId: ctx.dataLoadId,
    reconciliation: {
      plannedFy26Hires: null,
      completedHiresThroughBoundary: null,
      actualHeadcountAtBoundary: actual,
      payrollRunRate: payrollRunRate || null,
      approvedBudget: approvedBudget || null,
    },
    planVsActual,
    growthScenario: {
      hiringUpliftPct: growthUpliftPct,
      projectedFyeHeadcount: projected,
      bindingConstraint,
      note: 'Assumption-based scenario — not an AI prediction. Baseline population unchanged.',
    },
    calculationMethodVersion: ctx.calculationMethodVersion,
    freshness,
  }
}
