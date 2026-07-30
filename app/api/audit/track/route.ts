import { NextResponse } from 'next/server'
import { authErrorResponse, requireSession } from '@/lib/auth/guard'
import { writeAuditEvent, type AuditAction } from '@/lib/auth/audit'
import { readJsonBody } from '@/lib/db/filters'

const ALLOWED: AuditAction[] = [
  'page_access',
  'api_access',
  'employee_search',
  'employee_360',
  'wizard_query',
  'wizard_refusal',
  'wizard_tool_call',
  'report_create',
  'report_update',
  'report_export',
  'data_upload',
  'metrics_view',
  'planning_view',
  'audit_view',
]

/** Client-side page/navigation tracker — records every dashboard route visit. */
export async function POST(request: Request) {
  try {
    const session = await requireSession(request)
    const body = await readJsonBody<{
      action?: string
      route?: string
      targetType?: string
      targetId?: string
    }>(request)

    const action = (ALLOWED.includes(body.action as AuditAction)
      ? body.action
      : 'page_access') as AuditAction

    await writeAuditEvent({
      session,
      action,
      route: body.route ?? null,
      targetType: body.targetType ?? null,
      targetId: body.targetId ?? null,
      outcome: 'success',
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return authErrorResponse(error)
  }
}
