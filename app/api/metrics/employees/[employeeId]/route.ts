import { NextResponse } from 'next/server'
import { getEmployee360 } from '@/lib/db/class3'
import {
  authErrorResponse,
  requireEmployeeAccess,
  requireMetricContext,
} from '@/lib/auth/guard'
import { writeAuditEvent } from '@/lib/auth/audit'
import type { ApiErrorBody } from '@/lib/types'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  try {
    const { employeeId } = await params
    const ctx = await requireMetricContext({ request, selectedEntity: employeeId })
    await requireEmployeeAccess(ctx, employeeId)

    const data = await getEmployee360(employeeId, {
      fieldPermissions: ctx.fieldPermissions,
    })
    await writeAuditEvent({
      session: ctx.session,
      action: 'employee_360',
      targetType: 'employee',
      targetId: employeeId,
      route: `/employees/${employeeId}`,
      outcome: 'success',
      dataLoadId: ctx.dataLoadId,
    })
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && 'status' in error) return authErrorResponse(error)
    const body: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Employee 360 failed',
    }
    return NextResponse.json(body, { status: 500 })
  }
}
