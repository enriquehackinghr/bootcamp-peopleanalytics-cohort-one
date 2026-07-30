import { answerWizard } from '@/lib/wizard'
import { EMPTY_FILTER_CONTEXT } from '@/lib/types'
import type { WizardResponse } from '@/lib/types'

export interface WizardProbeResult {
  response: WizardResponse | null
  latencyMs: number
  error: string | null
}

/** Call the wizard as the "target under test." Never throws — errors are returned. */
export async function askWizardForAudit(question: string): Promise<WizardProbeResult> {
  const started = Date.now()
  try {
    const response = await answerWizard({
      question,
      filters: { ...EMPTY_FILTER_CONTEXT },
      context: null,
      conversation: [],
      confirmAction: null,
    })
    return {
      response,
      latencyMs: Date.now() - started,
      error: null,
    }
  } catch (err) {
    return {
      response: null,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
