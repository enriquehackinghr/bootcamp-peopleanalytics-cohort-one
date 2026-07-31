/**
 * Workforce planning — corrected Class 5 contract (supersedes PRD 4 double-count).
 *
 * estimated_fy_base_salary_expense
 *   = estimated_base_salary_expense_through_boundary
 *   + forecast_remaining_period_base_salary_expense
 *
 * Vacancy savings is a memo line only — never subtracted from the estimate.
 * Outputs are labelled estimated base-salary expense (NOT actual payroll spend).
 * Budget variance = estimated − approved; positive = over budget.
 *
 * Reference figures (informational):
 *   annualized base-salary run rate  $128,203,500
 *   approved FY26 budget             $151,110,763
 */

import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import type { PlanningRequestContext } from '@/lib/auth/types'
import { getFreshness } from '@/lib/db/metrics'

/** Informational annualized run-rate benchmark — not year-to-date expense. */
export const REFERENCE_ANNUALIZED_RUN_RATE = 128_203_500
/** Approved FY26 company base-salary budget (function sum). */
export const REFERENCE_APPROVED_FY26_BUDGET = 151_110_763

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

export type BindingConstraint = 'pipeline' | 'recruiter_capacity' | null

export type PlanningPageResponse = {
  reportingBoundary: string
  dataLoadId: string | null
  reconciliation: {
    plannedFy26Hires: number | null
    completedHiresThroughBoundary: number | null
    actualHeadcountAtBoundary: number | null
    /** @deprecated Prefer annualizedRunRateInformational — kept for older clients. */
    payrollRunRate: number | null
    /** Informational annualized base-salary run rate (not YTD expense). */
    annualizedRunRateInformational: number | null
    approvedBudget: number | null
    /** Sum of monthly snapshot base salary from FY start through boundary. */
    estimatedExpenseThroughBoundary: number | null
    /** Forecast base-salary expense from boundary+1 month through FYE. */
    forecastRemainingExpense: number | null
    /**
     * estimated_fy_base_salary_expense = through_boundary + remaining forecast.
     * Vacancy savings are NOT subtracted.
     */
    estimatedFyBaseSalaryExpense: number | null
    /** Memo only — planned salary for unfilled positions; never subtracted. */
    vacancySavingsMemo: number | null
    /**
     * estimated − approved. Positive means over budget.
     */
    budgetVariance: number | null
    budgetVarianceLabel: 'over_budget' | 'under_budget' | 'on_budget' | null
  }
  planVsActual: PlanVsActualRow[]
  growthScenario: {
    hiringUpliftPct: number
    projectedFyeHeadcount: number | null
    bindingConstraint: BindingConstraint
    bindingConstraintDetail: string | null
    pipelineCapacity: number | null
    recruiterCapacity: number | null
    note: string
  }
  calculationMethodVersion: string
  freshness: Awaited<ReturnType<typeof getFreshness>>
  terminologyNote: string
}

function monthsBetweenInclusive(start: Date, end: Date): number {
  const y = end.getUTCFullYear() - start.getUTCFullYear()
  const m = end.getUTCMonth() - start.getUTCMonth()
  return Math.max(0, y * 12 + m + 1)
}

function parseBoundary(iso: string): Date {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? new Date('2026-04-30T00:00:00Z') : d
}

function emptyResponse(
  ctx: PlanningRequestContext,
  growthUpliftPct: number,
  freshness: Awaited<ReturnType<typeof getFreshness>>,
): PlanningPageResponse {
  return {
    reportingBoundary: ctx.reportingBoundary,
    dataLoadId: ctx.dataLoadId,
    reconciliation: {
      plannedFy26Hires: null,
      completedHiresThroughBoundary: null,
      actualHeadcountAtBoundary: null,
      payrollRunRate: null,
      annualizedRunRateInformational: null,
      approvedBudget: null,
      estimatedExpenseThroughBoundary: null,
      forecastRemainingExpense: null,
      estimatedFyBaseSalaryExpense: null,
      vacancySavingsMemo: null,
      budgetVariance: null,
      budgetVarianceLabel: null,
    },
    planVsActual: [],
    growthScenario: {
      hiringUpliftPct: growthUpliftPct,
      projectedFyeHeadcount: null,
      bindingConstraint: null,
      bindingConstraintDetail: null,
      pipelineCapacity: null,
      recruiterCapacity: null,
      note: 'Assumption-based scenario — not an AI prediction.',
    },
    calculationMethodVersion: 'planning-v2-corrected',
    freshness,
    terminologyNote:
      'Figures are estimated base-salary expense from monthly salary state — not actual payroll spend. There is no payroll ledger in this system.',
  }
}

export async function getPlanningPage(
  ctx: PlanningRequestContext,
  growthUpliftPct = 10,
): Promise<PlanningPageResponse> {
  const freshness = await getFreshness()
  const empty = emptyResponse(ctx, growthUpliftPct, freshness)

  if (!hasDatabaseConfig()) {
    // Demo-tier illustrative numbers using reference figures when DB is absent.
    const boundary = parseBoundary(ctx.reportingBoundary)
    const fyStart = new Date(Date.UTC(ctx.planningPeriod.fiscalYear, 0, 1))
    const fyEnd = new Date(Date.UTC(ctx.planningPeriod.fiscalYear, 11, 31))
    const monthsThrough = Math.min(12, monthsBetweenInclusive(fyStart, boundary))
    const monthsRemaining = Math.max(0, 12 - monthsThrough)
    const monthly = REFERENCE_ANNUALIZED_RUN_RATE / 12
    const through = monthly * monthsThrough
    const remaining = monthly * monthsRemaining
    const estimated = through + remaining
    const variance = estimated - REFERENCE_APPROVED_FY26_BUDGET
    return {
      ...empty,
      reconciliation: {
        ...empty.reconciliation,
        annualizedRunRateInformational: REFERENCE_ANNUALIZED_RUN_RATE,
        payrollRunRate: REFERENCE_ANNUALIZED_RUN_RATE,
        approvedBudget: REFERENCE_APPROVED_FY26_BUDGET,
        estimatedExpenseThroughBoundary: Math.round(through),
        forecastRemainingExpense: Math.round(remaining),
        estimatedFyBaseSalaryExpense: Math.round(estimated),
        vacancySavingsMemo: 0,
        budgetVariance: Math.round(variance),
        budgetVarianceLabel:
          variance > 0 ? 'over_budget' : variance < 0 ? 'under_budget' : 'on_budget',
      },
      growthScenario: {
        ...empty.growthScenario,
        note:
          'Demo without database — using reference annualized run rate $128,203,500 and FY26 budget $151,110,763. Vacancy savings not subtracted.',
      },
    }
  }

  const supabase = getServiceSupabase()
  const boundary = parseBoundary(ctx.reportingBoundary)
  const fyYear = ctx.planningPeriod.fiscalYear
  const fyStart = new Date(Date.UTC(fyYear, 0, 1))
  const fyEnd = new Date(Date.UTC(fyYear, 11, 31))
  const fyStartIso = fyStart.toISOString().slice(0, 10)
  const boundaryIso = boundary.toISOString().slice(0, 10)
  const fyEndIso = fyEnd.toISOString().slice(0, 10)

  const { count: activeCount } = await supabase
    .from('employees')
    .select('employee_id', { count: 'exact', head: true })
    .in('employment_status', ['Active', 'active', 'On Leave', 'on leave'])

  const { data: salaryRows } = await supabase
    .from('employees')
    .select('base_salary, function_name, department')
    .in('employment_status', ['Active', 'active', 'On Leave', 'on leave'])
    .limit(5000)

  const annualizedRunRate = (salaryRows ?? []).reduce(
    (sum, r) => sum + (Number(r.base_salary) || 0),
    0,
  )
  const avgAnnual =
    (salaryRows?.length ?? 0) > 0 ? annualizedRunRate / (salaryRows?.length ?? 1) : 0
  const avgMonthly = avgAnnual / 12

  const byFunction = new Map<string, { headcount: number }>()
  for (const row of salaryRows ?? []) {
    const fn = (row.function_name || row.department || 'Unknown') as string
    const cur = byFunction.get(fn) ?? { headcount: 0 }
    cur.headcount += 1
    byFunction.set(fn, cur)
  }

  const { data: budgetRows } = await supabase.from('fy26_comp_budget').select('*').limit(500)
  const approvedBudgetFromDb = (budgetRows ?? []).reduce(
    (sum, r) =>
      sum + (Number((r as { approved_base_salary_budget?: number }).approved_base_salary_budget) || 0),
    0,
  )
  const approvedBudget = approvedBudgetFromDb || REFERENCE_APPROVED_FY26_BUDGET

  // Through-boundary: prefer monthly snapshots in FY; fall back to run-rate × months.
  let throughBoundary: number | null = null
  const { data: snapRows } = await supabase
    .from('employee_snapshots')
    .select('as_of_date, base_salary, employment_status')
    .gte('as_of_date', fyStartIso)
    .lte('as_of_date', boundaryIso)
    .limit(20000)

  if (snapRows && snapRows.length > 0) {
    // Partial-month rule: employee present on snapshot date contributes a full month.
    const byMonth = new Map<string, number>()
    for (const row of snapRows) {
      const status = String(row.employment_status ?? '')
      if (!/active|on leave/i.test(status)) continue
      const monthKey = String(row.as_of_date).slice(0, 7)
      byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + (Number(row.base_salary) || 0) / 12)
    }
    throughBoundary = [...byMonth.values()].reduce((a, b) => a + b, 0)
  }

  const monthsThrough = Math.min(12, monthsBetweenInclusive(fyStart, boundary))
  const monthsRemaining = Math.max(
    0,
    monthsBetweenInclusive(
      new Date(Date.UTC(boundary.getUTCFullYear(), boundary.getUTCMonth() + 1, 1)),
      fyEnd,
    ),
  )

  if (throughBoundary == null || throughBoundary === 0) {
    throughBoundary = (annualizedRunRate / 12) * monthsThrough
  }

  // Remaining forecast: opening HC roll-forward with growth uplift on hires; vacancies
  // simply omit salary until hire — no vacancy subtraction term.
  const { count: openReqs } = await supabase
    .from('requisitions')
    .select('requisition_id', { count: 'exact', head: true })
    .or('status.ilike.open,outcome.ilike.open')

  const openReqCount = openReqs ?? 0
  const baseMonthlyPayroll = annualizedRunRate / 12
  // Simplified month-by-month: hold filled run-rate, add uplifted hire cost for remaining months.
  const hireUpliftFactor = 1 + growthUpliftPct / 100
  const plannedHireMonthly =
    openReqCount > 0 ? (openReqCount * avgMonthly * hireUpliftFactor) / Math.max(monthsRemaining, 1) : 0
  const forecastRemaining =
    monthsRemaining * baseMonthlyPayroll + monthsRemaining * plannedHireMonthly * 0.25

  // Memo only — never subtracted from estimated_fy_base_salary_expense.
  const vacancySavingsMemo = openReqCount * avgMonthly * monthsRemaining

  const estimatedFy = throughBoundary + forecastRemaining
  const budgetVariance = estimatedFy - approvedBudget

  // Recruiting binding constraint: pipeline vs recruiter capacity.
  const { count: recruiterCount } = await supabase
    .from('recruiters')
    .select('recruiter_id', { count: 'exact', head: true })

  const recruiters = recruiterCount ?? 0
  const medianTtfDays = 60
  const remainingDays = Math.max(1, monthsRemaining * 30)
  const funnelConversion = 0.35
  const concurrentLoad = 8

  const pipelineCapacity = Math.round(
    openReqCount * funnelConversion * (remainingDays / medianTtfDays),
  )
  const recruiterCapacity = Math.round(
    recruiters * concurrentLoad * (remainingDays / medianTtfDays),
  )
  const expectedHires = Math.min(pipelineCapacity, recruiterCapacity)

  let bindingConstraint: BindingConstraint = null
  let bindingConstraintDetail: string | null = null
  if (openReqCount > 0 || recruiters > 0) {
    if (pipelineCapacity <= recruiterCapacity) {
      bindingConstraint = 'pipeline'
      bindingConstraintDetail =
        `Binding constraint: pipeline (expected ≈ ${expectedHires}). ` +
        `Pipeline capacity ${pipelineCapacity}; recruiter capacity ${recruiterCapacity} is not the constraint.`
    } else {
      bindingConstraint = 'recruiter_capacity'
      bindingConstraintDetail =
        `Binding constraint: recruiter capacity (expected ≈ ${expectedHires}). ` +
        `Recruiter capacity ${recruiterCapacity}; pipeline capacity ${pipelineCapacity} is not the constraint.`
    }
  }

  const planVsActual: PlanVsActualRow[] = [...byFunction.entries()]
    .sort((a, b) => b[1].headcount - a[1].headcount)
    .slice(0, 12)
    .map(([functionName, stats]) => {
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

  return {
    reportingBoundary: ctx.reportingBoundary,
    dataLoadId: ctx.dataLoadId,
    reconciliation: {
      plannedFy26Hires: null,
      completedHiresThroughBoundary: null,
      actualHeadcountAtBoundary: actual,
      payrollRunRate: annualizedRunRate || REFERENCE_ANNUALIZED_RUN_RATE,
      annualizedRunRateInformational:
        annualizedRunRate || REFERENCE_ANNUALIZED_RUN_RATE,
      approvedBudget: approvedBudget || null,
      estimatedExpenseThroughBoundary: Math.round(throughBoundary),
      forecastRemainingExpense: Math.round(forecastRemaining),
      estimatedFyBaseSalaryExpense: Math.round(estimatedFy),
      vacancySavingsMemo: Math.round(vacancySavingsMemo),
      budgetVariance: Math.round(budgetVariance),
      budgetVarianceLabel:
        budgetVariance > 0 ? 'over_budget' : budgetVariance < 0 ? 'under_budget' : 'on_budget',
    },
    planVsActual,
    growthScenario: {
      hiringUpliftPct: growthUpliftPct,
      projectedFyeHeadcount: projected,
      bindingConstraint,
      bindingConstraintDetail,
      pipelineCapacity,
      recruiterCapacity,
      note:
        'Assumption-based scenario — not an AI prediction. ' +
        'estimated_fy_base_salary_expense = through_boundary + remaining forecast; vacancy savings are memo-only. ' +
        `FY window ${fyStartIso} → ${fyEndIso}; boundary ${boundaryIso}.`,
    },
    calculationMethodVersion: 'planning-v2-corrected',
    freshness,
    terminologyNote:
      'Figures are estimated base-salary expense from monthly salary state — not actual payroll spend. There is no payroll ledger in this system.',
  }
}
