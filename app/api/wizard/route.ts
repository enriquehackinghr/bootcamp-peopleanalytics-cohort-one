import { NextResponse } from 'next/server'
import { parseFilterContext, readJsonBody } from '@/lib/db/filters'
import { answerWizard } from '@/lib/wizard'
import type {
  ApiErrorBody,
  DashboardContext,
  FilterContext,
  WizardConversationTurn,
  WizardAction,
} from '@/lib/types'

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<{
      question?: string
      filters?: FilterContext
      context?: Partial<DashboardContext> | null
      conversation?: WizardConversationTurn[]
      confirmAction?: WizardAction | null
    }>(request)

    const data = await answerWizard({
      question: body.question ?? '',
      filters: parseFilterContext(body.filters),
      context: body.context ?? null,
      conversation: body.conversation ?? [],
      confirmAction: body.confirmAction ?? null,
    })
    return NextResponse.json(data)
  } catch (error) {
    const errBody: ApiErrorBody = {
      error: error instanceof Error ? error.message : 'Wizard failed',
    }
    return NextResponse.json(errBody, { status: 500 })
  }
}
