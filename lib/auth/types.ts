/** Class 4 access-control types. Roles come from app_role — never inferred. */

export type AppRole = 'admin' | 'executive' | 'manager' | 'viewer'

export type FieldClass =
  | 'identity'
  | 'history'
  | 'compensation'
  | 'equity'
  | 'performance'
  | 'talent'
  | 'promotion_readiness'
  | 'succession'
  | 'risk'
  | 'engagement_individual'
  | 'engagement_anonymous'
  | 'demographics'
  | 'exit'
  | 'aggregates'
  | 'data_upload'
  | 'audit_log'

export interface SessionUser {
  sessionId: string
  employeeId: string
  workEmail: string
  fullName: string
  appRole: AppRole
  expiresAt: number
}

export interface FieldPermissions {
  identity: boolean
  history: boolean
  compensation: boolean
  equity: boolean
  performance: boolean
  talent: boolean
  promotion_readiness: boolean
  succession: boolean
  risk: boolean
  engagement_individual: boolean
  engagement_anonymous: boolean
  demographics: boolean
  exit: 'full' | 'aggregate' | 'none'
  aggregates: boolean
  data_upload: boolean
  audit_log: boolean
}

export interface MetricRequestContext {
  session: SessionUser
  appRole: AppRole
  visibleEmployeeIds: Set<string> | 'all'
  fieldPermissions: FieldPermissions
  filters: import('@/lib/types').FilterContext
  period: import('@/lib/types').PeriodSelection
  comparisonPeriod: import('@/lib/types').ComparisonMode
  reportingBoundary: string
  dataLoadId: string | null
  suppressionThreshold: number
  currencyBasis: 'USD'
  currentRoute: string | null
  selectedEntity: string | null
}

export interface PlanningRequestContext extends MetricRequestContext {
  planningPeriod: { fiscalYear: number; quarters: string[] }
  assumptionSetId: string | null
  scenarioType: 'baseline' | 'growth' | 'contraction' | 'restructuring'
  calculationMethodVersion: string
}

export const SESSION_COOKIE = 'meridian_session'
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000
