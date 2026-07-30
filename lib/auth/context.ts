import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import { fieldPermissionsFor, getVisibleEmployeeIds } from '@/lib/auth/permissions'
import type { MetricRequestContext, PlanningRequestContext, SessionUser } from '@/lib/auth/types'
import { EMPTY_FILTER_CONTEXT, MIN_CELL_SIZE, type FilterContext } from '@/lib/types'

/** Expected Meridian v4 reporting boundary — validation target, not a runtime hardcoded as-of. */
export const EXPECTED_REPORTING_BOUNDARY = '2026-04-30'

export async function resolveReportingBoundary(): Promise<{
  reportingBoundary: string
  dataLoadId: string | null
}> {
  if (!hasDatabaseConfig()) {
    return { reportingBoundary: EXPECTED_REPORTING_BOUNDARY, dataLoadId: null }
  }
  const supabase = getServiceSupabase()

  // Prefer validated data_loads row when Class 4 columns exist.
  const { data: load } = await supabase
    .from('data_loads')
    .select('id, as_of_date, data_load_id, reporting_boundary')
    .order('loaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (load) {
    const boundary =
      (load as { reporting_boundary?: string | null }).reporting_boundary ||
      (load as { as_of_date?: string | null }).as_of_date ||
      null
    const dataLoadId =
      (load as { data_load_id?: string | null }).data_load_id ||
      (load as { id?: string | null }).id ||
      null
    if (boundary) {
      return { reportingBoundary: String(boundary).slice(0, 10), dataLoadId }
    }
  }

  // Authoritative: max as_of_date on employee_snapshots.
  const { data: snap } = await supabase
    .from('employee_snapshots')
    .select('as_of_date')
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (snap?.as_of_date) {
    return {
      reportingBoundary: String(snap.as_of_date).slice(0, 10),
      dataLoadId: null,
    }
  }

  return { reportingBoundary: EXPECTED_REPORTING_BOUNDARY, dataLoadId: null }
}

export async function buildMetricRequestContext(input: {
  session: SessionUser
  filters?: FilterContext | null
  currentRoute?: string | null
  selectedEntity?: string | null
}): Promise<MetricRequestContext> {
  const filters = input.filters ?? EMPTY_FILTER_CONTEXT
  const [{ reportingBoundary, dataLoadId }, visibleEmployeeIds] = await Promise.all([
    resolveReportingBoundary(),
    getVisibleEmployeeIds(input.session),
  ])

  return {
    session: input.session,
    appRole: input.session.appRole,
    visibleEmployeeIds,
    fieldPermissions: fieldPermissionsFor(input.session.appRole),
    filters,
    period: filters.period,
    comparisonPeriod: filters.comparison,
    reportingBoundary,
    dataLoadId,
    suppressionThreshold: MIN_CELL_SIZE,
    currencyBasis: 'USD',
    currentRoute: input.currentRoute ?? null,
    selectedEntity: input.selectedEntity ?? null,
  }
}

export async function buildPlanningRequestContext(input: {
  session: SessionUser
  filters?: FilterContext | null
  scenarioType?: PlanningRequestContext['scenarioType']
  assumptionSetId?: string | null
}): Promise<PlanningRequestContext> {
  const base = await buildMetricRequestContext(input)
  return {
    ...base,
    planningPeriod: { fiscalYear: 2026, quarters: ['Q1', 'Q2', 'Q3', 'Q4'] },
    assumptionSetId: input.assumptionSetId ?? null,
    scenarioType: input.scenarioType ?? 'baseline',
    calculationMethodVersion: 'planning-v1',
  }
}
