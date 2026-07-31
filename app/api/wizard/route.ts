import { NextResponse } from 'next/server'
import { parseFilterContext, readJsonBody } from '@/lib/db/filters'
import { answerWizard } from '@/lib/wizard'
import { authErrorResponse, requireMetricContext } from '@/lib/auth/guard'
import { writeAuditEvent } from '@/lib/auth/audit'
import type {
  ApiErrorBody,
  DashboardContext,
  FilterContext,
  WizardConversationTurn,
  WizardAction,
} from '@/lib/types'

export async function POST(request: Request) {
  try {
    const { isWizardEnabled, featureDisabledResponse } = await import('@/lib/features')
    if (!isWizardEnabled()) {
      return NextResponse.json(featureDisabledResponse('Wizard'), { status: 403 })
    }

    const body = await readJsonBody<{
      question?: string
      filters?: FilterContext
      context?: Partial<DashboardContext> | null
      conversation?: WizardConversationTurn[]
      confirmAction?: WizardAction | null
    }>(request)

    const ctx = await requireMetricContext({ request, filters: body.filters,
      currentRoute: body.context?.current_route,
      selectedEntity: body.context?.scoped_employee_id,
    })

    const scopeSize =
      ctx.visibleEmployeeIds === 'all' ? 820 : ctx.visibleEmployeeIds.size

    await writeAuditEvent({
      session: ctx.session,
      action: 'wizard_query',
      toolName: null,
      scopeSize,
      outcome: 'success',
      metadata: { questionLength: (body.question ?? '').length },
      dataLoadId: ctx.dataLoadId,
    })

    const data = await answerWizard({
      question: body.question ?? '',
      filters: parseFilterContext(body.filters),
      context: body.context ?? null,
      conversation: body.conversation ?? [],
      confirmAction: body.confirmAction ?? null,
      sessionRole: ctx.appRole,
      reportingBoundary: ctx.reportingBoundary,
      dataLoadId: ctx.dataLoadId,
      visibleScopeSize: scopeSize,
    })

    if (data.refused) {
      await writeAuditEvent({
        session: ctx.session,
        action: 'wizard_refusal',
        outcome: 'denied',
        denialReason: data.refusalReason,
        dataLoadId: ctx.dataLoadId,
      })
    }

    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && 'status' in error) return authErrorResponse(error)
    const errBody: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Wizard failed',
    }
    return NextResponse.json(errBody, { status: 500 })
  }
}
