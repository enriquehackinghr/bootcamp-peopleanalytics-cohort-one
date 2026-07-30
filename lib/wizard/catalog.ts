/**
 * Wizard tool catalog with Class 4 status contract.
 * Only tools with implemented + validated + available are exposed to the model.
 */
import type { AppRole } from '@/lib/auth/types'

export type ToolImplementationStatus = 'planned' | 'implemented' | 'deferred'
export type ToolValidationStatus = 'not_tested' | 'failed' | 'validated'
export type ToolWizardAvailability = 'hidden' | 'available'

export type WizardToolDefinition = {
  name: string
  purpose: string
  allowedRoles: AppRole[]
  aggregate: boolean
  implementation_status: ToolImplementationStatus
  validation_status: ToolValidationStatus
  wizard_availability: ToolWizardAvailability
  sourceMeasures: string[]
}

/** Catalog — promote tools to available only after a passing eval case. */
export const WIZARD_TOOL_CATALOG: WizardToolDefinition[] = [
  {
    name: 'getHeadcount',
    purpose: 'Active headcount at the reporting boundary',
    allowedRoles: ['admin', 'executive', 'manager', 'viewer'],
    aggregate: true,
    implementation_status: 'implemented',
    validation_status: 'validated',
    wizard_availability: 'available',
    sourceMeasures: ['active_headcount'],
  },
  {
    name: 'getAttritionRate',
    purpose: 'Attrition rate for the selected filters and period',
    allowedRoles: ['admin', 'executive', 'manager', 'viewer'],
    aggregate: true,
    implementation_status: 'implemented',
    validation_status: 'validated',
    wizard_availability: 'available',
    sourceMeasures: ['attrition_rate'],
  },
  {
    name: 'getOpenRequisitions',
    purpose: 'Count of currently open requisitions',
    allowedRoles: ['admin', 'executive', 'manager', 'viewer'],
    aggregate: true,
    implementation_status: 'implemented',
    validation_status: 'validated',
    wizard_availability: 'available',
    sourceMeasures: ['open_requisitions'],
  },
  {
    name: 'getEngagementScore',
    purpose: 'Company engagement score (approved instrument)',
    allowedRoles: ['admin', 'executive', 'manager', 'viewer'],
    aggregate: true,
    implementation_status: 'implemented',
    validation_status: 'validated',
    wizard_availability: 'available',
    sourceMeasures: ['engagement_score'],
  },
  {
    name: 'getCompaRatioDistribution',
    purpose: 'Compa-ratio distribution',
    allowedRoles: ['admin', 'executive', 'manager', 'viewer'],
    aggregate: true,
    implementation_status: 'implemented',
    validation_status: 'validated',
    wizard_availability: 'available',
    sourceMeasures: ['compa_ratio'],
  },
  {
    name: 'findEmployees',
    purpose: 'Search employees in visible scope',
    allowedRoles: ['admin', 'executive', 'manager'],
    aggregate: false,
    implementation_status: 'implemented',
    validation_status: 'validated',
    wizard_availability: 'available',
    sourceMeasures: ['employee_directory'],
  },
  {
    name: 'getEmployeeSummary',
    purpose: 'Summarize one in-scope employee',
    allowedRoles: ['admin', 'executive', 'manager'],
    aggregate: false,
    implementation_status: 'implemented',
    validation_status: 'validated',
    wizard_availability: 'available',
    sourceMeasures: ['employee_360'],
  },
  {
    name: 'getHeadcountPlanVsActual',
    purpose: 'FY26 headcount plan versus actual',
    allowedRoles: ['admin', 'executive', 'manager', 'viewer'],
    aggregate: true,
    implementation_status: 'implemented',
    validation_status: 'validated',
    wizard_availability: 'available',
    sourceMeasures: ['headcount_plan'],
  },
  {
    name: 'getMetricDefinition',
    purpose: 'Look up a metric definition',
    allowedRoles: ['admin', 'executive', 'manager', 'viewer'],
    aggregate: true,
    implementation_status: 'implemented',
    validation_status: 'validated',
    wizard_availability: 'available',
    sourceMeasures: ['methodology'],
  },
  // Planned / deferred — never declared to the model.
  {
    name: 'getRestructuringScenario',
    purpose: 'Restructuring scenario projection',
    allowedRoles: ['admin', 'executive'],
    aggregate: true,
    implementation_status: 'deferred',
    validation_status: 'not_tested',
    wizard_availability: 'hidden',
    sourceMeasures: ['scenario'],
  },
  {
    name: 'getDemographicsBreakdown',
    purpose: 'Demographic cut — intentionally excluded from Wizard channel',
    allowedRoles: ['admin', 'executive'],
    aggregate: true,
    implementation_status: 'deferred',
    validation_status: 'not_tested',
    wizard_availability: 'hidden',
    sourceMeasures: ['demographics'],
  },
]

export function isToolExposed(tool: WizardToolDefinition): boolean {
  return (
    tool.implementation_status === 'implemented' &&
    tool.validation_status === 'validated' &&
    tool.wizard_availability === 'available'
  )
}

export function activeWizardTools(role: AppRole): WizardToolDefinition[] {
  return WIZARD_TOOL_CATALOG.filter(
    (t) => isToolExposed(t) && t.allowedRoles.includes(role),
  )
}

export function wizardToolStatusSummary() {
  const total = WIZARD_TOOL_CATALOG.length
  const active = WIZARD_TOOL_CATALOG.filter(isToolExposed).length
  return {
    total_tool_count: total,
    active_tool_count: active,
    label: `${active} of ${total} tools active`,
  }
}

export function listActiveToolNames(role: AppRole): string[] {
  return activeWizardTools(role).map((t) => t.name)
}
