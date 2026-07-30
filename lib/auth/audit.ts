import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import type { SessionUser } from '@/lib/auth/types'

export type AuditAction =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'page_access'
  | 'api_access'
  | 'employee_search'
  | 'employee_360'
  | 'unauthorized_url'
  | 'wizard_query'
  | 'wizard_refusal'
  | 'wizard_tool_call'
  | 'report_create'
  | 'report_update'
  | 'report_export'
  | 'data_upload'
  | 'permission_denial'
  | 'data_load_change'
  | 'metrics_view'
  | 'planning_view'
  | 'audit_view'

export async function writeAuditEvent(input: {
  session?: SessionUser | null
  action: AuditAction
  targetType?: string | null
  targetId?: string | null
  route?: string | null
  toolName?: string | null
  scopeSize?: number | null
  outcome?: 'success' | 'denied' | 'error'
  denialReason?: string | null
  metadata?: Record<string, unknown> | null
  dataLoadId?: string | null
  workEmail?: string | null
}): Promise<void> {
  if (!hasDatabaseConfig()) return
  try {
    const supabase = getServiceSupabase()
    // Redact sensitive values from metadata — never store raw compensation/risk/ratings.
    const meta = input.metadata ? { ...input.metadata } : null
    if (meta) {
      for (const key of Object.keys(meta)) {
        if (/salary|compensation|rating|risk|bonus|equity/i.test(key)) {
          meta[key] = '[redacted]'
        }
      }
    }
    const { error } = await supabase.from('access_audit_log').insert({
      session_id: input.session?.sessionId ?? null,
      employee_id: input.session?.employeeId ?? null,
      work_email: input.session?.workEmail ?? input.workEmail ?? null,
      app_role: input.session?.appRole ?? null,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      route: input.route ?? null,
      tool_name: input.toolName ?? null,
      scope_size: input.scopeSize ?? null,
      outcome: input.outcome ?? 'success',
      denial_reason: input.denialReason ?? null,
      metadata: meta,
      data_load_id: input.dataLoadId ?? null,
    })
    if (error) {
      console.error('audit write failed', error.message)
    }
  } catch (err) {
    console.error('audit write failed', err instanceof Error ? err.message : err)
  }
}

/** Map an API path to a concise audit action. */
export function auditActionForApiPath(pathname: string): AuditAction {
  if (pathname.startsWith('/api/wizard')) return 'wizard_query'
  if (pathname.startsWith('/api/employees/search')) return 'employee_search'
  if (pathname.includes('/employees/')) return 'employee_360'
  if (pathname.startsWith('/api/org-chart')) return 'api_access'
  if (pathname.startsWith('/api/metrics/planning')) return 'planning_view'
  if (pathname.startsWith('/api/metrics')) return 'metrics_view'
  if (pathname.startsWith('/api/reports')) return 'report_create'
  if (pathname.startsWith('/api/ingest')) return 'data_upload'
  if (pathname.startsWith('/api/audit')) return 'audit_view'
  return 'api_access'
}
