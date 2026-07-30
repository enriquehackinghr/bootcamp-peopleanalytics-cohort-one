import type { AuditorReportEvaluation } from './types'

export const DEFAULT_AUDITOR_MODEL =
  process.env.ADVERSARIAL_AI_MODEL || 'claude-opus-4-5'
export const FALLBACK_AUDITOR_MODEL =
  process.env.ADVERSARIAL_AI_FALLBACK_MODEL || 'claude-sonnet-4-5'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

const EVAL_TOOL = {
  name: 'record_report_evaluation',
  description:
    'Record the auditor evaluation for one report. Must be called exactly once.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['scores', 'summary', 'recommendations', 'flags'],
    properties: {
      scores: {
        type: 'object',
        additionalProperties: false,
        required: [
          'factual_grounding',
          'methodology_soundness',
          'bias_fairness',
          'hallucination',
          'actionability',
        ],
        properties: {
          factual_grounding: { type: 'integer', minimum: 1, maximum: 5 },
          methodology_soundness: { type: 'integer', minimum: 1, maximum: 5 },
          bias_fairness: { type: 'integer', minimum: 1, maximum: 5 },
          hallucination: { type: 'integer', minimum: 1, maximum: 5 },
          actionability: { type: 'integer', minimum: 1, maximum: 5 },
        },
      },
      summary: { type: 'string', maxLength: 600 },
      recommendations: {
        type: 'array',
        minItems: 1,
        maxItems: 6,
        items: { type: 'string', maxLength: 400 },
      },
      flags: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['severity', 'dimension', 'description'],
          properties: {
            severity: { type: 'string', enum: ['critical', 'warning', 'info'] },
            dimension: {
              type: 'string',
              enum: [
                'factual_grounding',
                'methodology_soundness',
                'bias_fairness',
                'hallucination',
                'actionability',
              ],
            },
            description: { type: 'string', maxLength: 400 },
          },
        },
      },
    },
  },
} as const

interface AnthropicToolUseBlock {
  type: 'tool_use'
  name: string
  input: unknown
}

interface AnthropicResponse {
  content?: Array<AnthropicToolUseBlock | { type: string }>
  error?: { message?: string; type?: string }
}

export interface AuditorCallOptions {
  system: string
  user: string
  model?: string
  maxTokens?: number
}

export interface AuditorCallResult {
  evaluation: AuditorReportEvaluation
  modelUsed: string
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ADVERSARIAL_AI_LLM_API_KEY)
}

async function callOnce(
  opts: AuditorCallOptions,
  model: string,
): Promise<AuditorCallResult> {
  const apiKey = process.env.ADVERSARIAL_AI_LLM_API_KEY
  if (!apiKey) {
    throw new Error(
      'ADVERSARIAL_AI_LLM_API_KEY is not set — cannot run the adversarial auditor.',
    )
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1500,
      temperature: 0,
      system: opts.system,
      tools: [EVAL_TOOL],
      tool_choice: { type: 'tool', name: EVAL_TOOL.name },
      messages: [{ role: 'user', content: opts.user }],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 400)}`)
  }

  const body = (await res.json()) as AnthropicResponse
  const toolBlock = (body.content ?? []).find(
    (b): b is AnthropicToolUseBlock =>
      b.type === 'tool_use' && (b as AnthropicToolUseBlock).name === EVAL_TOOL.name,
  )
  if (!toolBlock) {
    throw new Error('Auditor returned no tool_use block')
  }
  return {
    evaluation: toolBlock.input as AuditorReportEvaluation,
    modelUsed: model,
  }
}

/** Call Claude with the primary model; fall back to the secondary model on error. */
export async function callAuditor(
  opts: AuditorCallOptions,
): Promise<AuditorCallResult> {
  const primary = opts.model || DEFAULT_AUDITOR_MODEL
  try {
    return await callOnce(opts, primary)
  } catch (primaryError) {
    if (FALLBACK_AUDITOR_MODEL && FALLBACK_AUDITOR_MODEL !== primary) {
      try {
        return await callOnce(opts, FALLBACK_AUDITOR_MODEL)
      } catch {
        throw primaryError
      }
    }
    throw primaryError
  }
}
