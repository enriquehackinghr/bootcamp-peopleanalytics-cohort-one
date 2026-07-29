import type {
  DashboardContext,
  FilterContext,
  WizardAction,
  WizardRequest,
  WizardResponse,
} from '@/lib/types'
import { buildWizardSystemPrompt } from '@/lib/wizard/prompt'
import { runWizardToolQuery } from '@/lib/wizard/tools'

const REFUSAL_PATTERNS: { pattern: RegExp; reason: string; alternative: string }[] = [
  {
    pattern: /rank(ing)?\s+(named\s+)?(individuals?|employees?|people).*(risk|attrition)/i,
    reason: 'named_individual_risk',
    alternative:
      'I can’t rank named individuals by attrition risk. I can show cohort risk-band distribution or Elevated+ headcount instead.',
  },
  {
    pattern: /who\s+(is|are)\s+(most\s+)?(likely|at\s+risk).*(leave|quit|resign)/i,
    reason: 'named_individual_risk',
    alternative:
      'Individual risk ranking isn’t available. Try cohort risk bands or manager-team risk concentration.',
  },
  {
    pattern: /salary of\s+\w+|compensation for\s+[A-Z][a-z]+/i,
    reason: 'privacy_refusal',
    alternative:
      'I can’t share individual compensation for a named employee. I can show cohort compa-ratio bands.',
  },
  {
    pattern: /performance (of|for)\s+[A-Z][a-z]+/i,
    reason: 'privacy_refusal',
    alternative:
      'I can’t share individual performance for a named employee outside an authorized Employee 360 context.',
  },
  {
    pattern: /who (said|wrote|answered).*(engagement|survey)/i,
    reason: 'anonymous_respondent',
    alternative:
      'Engagement survey responses are anonymous. I can show aggregate category or wave means instead.',
  },
  {
    pattern: /rank(ing)?\s+(named\s+)?managers?(?!.*(component|four))/i,
    reason: 'manager_ranking_without_components',
    alternative:
      'I won’t rank named managers without their four effectiveness components. Open manager effectiveness on Advanced Analytics.',
  },
  {
    pattern: /fire|terminate\s+them|employment\s+decision|pip\s+them/i,
    reason: 'employment_decision',
    alternative:
      'Risk and readiness outputs are investigation prompts only — never an employment decision. I can suggest further analyses and human questions.',
  },
]

const INCOMPLETE_ANSWER =
  /\b(i will|i'll|let me|i am going to|i'm going to)\b.*\b(now|check|look|get|fetch|find|do that)\b/i

function proposedActionsFor(
  question: string,
  context?: Partial<DashboardContext> | null,
): WizardAction[] {
  const actions: WizardAction[] = []
  if (/advanced analytics|retention risk|tenure hazard/i.test(question)) {
    actions.push({
      type: 'open_page',
      label: 'Open Advanced Analytics',
      requiresConfirmation: false,
      payload: { href: '/advanced-analytics' },
    })
  }
  if (/save.*(report|chart)|customized report/i.test(question)) {
    actions.push({
      type: 'create_customized_report',
      label: 'Save as customized report',
      requiresConfirmation: true,
      payload: {
        spec: {
          title: 'Wizard report',
          description: question.slice(0, 160),
          measures: ['c3_voluntary_attrition_rate'],
          report_type: 'chart',
          created_via_wizard: true,
        },
      },
    })
  }
  if (/methodology|how.*score|weights/i.test(question)) {
    actions.push({
      type: 'open_methodology',
      label: 'Open methodology',
      requiresConfirmation: false,
      payload: { href: '/methodology#attrition_risk' },
    })
  }
  if (context?.scoped_manager_id) {
    actions.push({
      type: 'open_manager',
      label: `Open manager ${context.scoped_manager_id}`,
      requiresConfirmation: false,
      payload: { href: `/managers/${context.scoped_manager_id}` },
    })
  }
  return actions
}

function finalizeAnswer(
  llmAnswer: string | undefined,
  fallbackAnswer: string,
): string {
  const text = (llmAnswer || '').trim()
  if (!text) return fallbackAnswer
  if (INCOMPLETE_ANSWER.test(text) && !/\d/.test(text)) return fallbackAnswer
  // Prefer tool numbers when the model hedges or contradicts the snapshot prose.
  if (INCOMPLETE_ANSWER.test(text)) {
    return `${fallbackAnswer} ${text.replace(INCOMPLETE_ANSWER, '').trim()}`.trim()
  }
  // If the model omitted the grounded snapshot entirely, prepend it.
  if (fallbackAnswer && !text.includes(String(fallbackAnswer.match(/\d+(\.\d+)?/)?.[0] ?? '__none__'))) {
    // Still accept LLM prose when it cites at least one digit from the snapshot.
    const snapshotNums = [...fallbackAnswer.matchAll(/\d+(\.\d+)?/g)].map((m) => m[0])
    const citesSnapshot = snapshotNums.some((n) => text.includes(n))
    if (!citesSnapshot && snapshotNums.length) {
      return `${fallbackAnswer}\n\n${text}`
    }
  }
  return text
}

export async function answerWizard(request: WizardRequest): Promise<WizardResponse> {
  const question = request.question.trim()
  if (!question) {
    return {
      answer: 'Ask a workforce question grounded in the Meridian metrics model.',
      citations: [],
      chart: null,
      filterOverridden: false,
      refused: false,
      refusalReason: null,
      proposedActions: [],
    }
  }

  for (const rule of REFUSAL_PATTERNS) {
    if (rule.pattern.test(question)) {
      return {
        answer: rule.alternative,
        citations: [],
        chart: null,
        filterOverridden: false,
        refused: true,
        refusalReason: rule.reason,
        proposedActions: [
          {
            type: 'open_page',
            label: 'Open Advanced Analytics (cohort view)',
            requiresConfirmation: false,
            payload: { href: '/advanced-analytics' },
          },
        ],
      }
    }
  }

  const filterOverridden = /ignore filters|across the company|company-wide/i.test(
    question,
  )
  const effectiveFilters: FilterContext = filterOverridden
    ? {
        ...request.filters,
        functions: [],
        locations: [],
        levelBands: [],
        tenureBands: [],
        crossFilter: null,
      }
    : request.filters

  const toolResult = await runWizardToolQuery(question, effectiveFilters)
  const actions = proposedActionsFor(question, request.context)

  const grounded = {
    answer: toolResult.fallbackAnswer,
    citations: toolResult.citations,
    chart: toolResult.chart,
    filterOverridden,
    refused: false,
    refusalReason: null,
    proposedActions: actions,
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return grounded
  }

  const system = buildWizardSystemPrompt()
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  const completion = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: JSON.stringify({
            question,
            filters: effectiveFilters,
            filterOverridden,
            dashboardContext: request.context ?? null,
            conversation: request.conversation ?? [],
            measureSnapshot: toolResult.snapshot,
            authoritativeAnswer: toolResult.fallbackAnswer,
            instructions: [
              'Return a COMPLETE final answer now — never say you will look something up or do it later.',
              'Use ONLY numbers from measureSnapshot / authoritativeAnswer. Do not invent or round differently.',
              'If the question asks for open roles/requisitions, use open_requisitions exactly.',
              'If a chart helps, return chartSpec matching WizardChartSpec; otherwise null.',
            ].join(' '),
          }),
        },
      ],
      response_format: { type: 'json_object' },
    }),
  })

  if (!completion.ok) {
    const text = await completion.text()
    console.error('OpenAI error', text)
    return grounded
  }

  const payload = (await completion.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = payload.choices?.[0]?.message?.content ?? '{}'
  let parsed: {
    answer?: string
    chart?: WizardResponse['chart']
    refused?: boolean
    refusalReason?: string | null
  }
  try {
    parsed = JSON.parse(content)
  } catch {
    parsed = { answer: toolResult.fallbackAnswer }
  }

  return {
    answer: finalizeAnswer(parsed.answer, toolResult.fallbackAnswer),
    citations: toolResult.citations,
    chart: parsed.chart ?? toolResult.chart,
    filterOverridden,
    refused: Boolean(parsed.refused),
    refusalReason: parsed.refusalReason ?? null,
    proposedActions: actions,
  }
}
