import { NextResponse } from 'next/server'
import { authErrorResponse, requireMetricContext } from '@/lib/auth/guard'
import { writeAuditEvent } from '@/lib/auth/audit'
import { searchEmployees } from '@/lib/db/employees'
import { parseFilterContext, readJsonBody } from '@/lib/db/filters'

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<{
      query?: string
      department?: string
      functionName?: string
      level?: string
      location?: string
    }>(request)

    const ctx = await requireMetricContext({ request })
    if (ctx.appRole === 'viewer') {
      return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
    }

    const rows = await searchEmployees(ctx, body.query ?? '', {
      department: body.department,
      functionName: body.functionName,
      level: body.level,
      location: body.location,
    })

    await writeAuditEvent({
      session: ctx.session,
      action: 'employee_search',
      outcome: 'success',
      scopeSize: rows.length,
      metadata: { queryLength: (body.query ?? '').length },
      dataLoadId: ctx.dataLoadId,
    })

    return NextResponse.json({
      rows,
      reportingBoundary: ctx.reportingBoundary,
      dataLoadId: ctx.dataLoadId,
      filterEcho: parseFilterContext(undefined),
    })
  } catch (error) {
    return authErrorResponse(error)
  }
}
