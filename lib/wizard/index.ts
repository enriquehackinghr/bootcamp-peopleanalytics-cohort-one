import type {
  CustomizedReportSpec,
  DashboardContext,
  FilterContext,
  WizardAction,
  WizardChartSpec,
  WizardCitation,
  WizardRequest,
  WizardResponse,
} from '@/lib/types'
import { buildWizardSystemPrompt } from '@/lib/wizard/prompt'
import {
  buildWizardReportSpec,
  findLastChartsInConversation,
  pickRenderableCharts,
} from '@/lib/wizard/reportSpec'
import {
  guardFunctionHeadcountAnswer,
  runWizardToolQuery,
} from '@/lib/wizard/tools'

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
  reportSpec?: Partial<CustomizedReportSpec> | null,
): WizardAction[] {
  const actions: WizardAction[] = []
  if (/save.*(report|chart)|customized report/i.test(question)) {
    actions.push({
      type: 'create_customized_report',
      label: 'Save as customized report',
      requiresConfirmation: true,
      payload: {
        spec:
          reportSpec ??
          ({
            title: 'Wizard report',
            description: question.slice(0, 160),
            measures: ['active_headcount'],
            report_type: 'chart',
            created_via_wizard: true,
            visuals: [],
          } satisfies Partial<CustomizedReportSpec>),
      },
    })
  }
  if (/advanced analytics|retention risk|tenure hazard/i.test(question)) {
    actions.push({
      type: 'open_page',
      label: 'Open Advanced Analytics',
      requiresConfirmation: false,
      payload: { href: '/advanced-analytics' },
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

function withReportArtifacts(
  base: Omit<WizardResponse, 'reportSpec' | 'proposedActions'> & {
    proposedActions?: WizardAction[]
  },
  opts: {
    question: string
    charts: WizardChartSpec[]
    citations: WizardCitation[]
    filters: FilterContext
    context?: Partial<DashboardContext> | null
  },
): WizardResponse {
  const wantsReport = /save.*(report|chart)|customized report/i.test(opts.question)
  const chart = opts.charts[0] ?? null
  const reportSpec = wantsReport
    ? buildWizardReportSpec({
        question: opts.question,
        charts: opts.charts,
        chart,
        citations: opts.citations,
        filters: opts.filters,
      })
    : null
  return {
    ...base,
    chart,
    charts: opts.charts,
    reportSpec,
    proposedActions: proposedActionsFor(opts.question, opts.context, reportSpec),
  }
}

function finalizeAnswer(
  llmAnswer: string | undefined,
  fallbackAnswer: string,
  preferAuthoritative: boolean,
): string {
  if (preferAuthoritative) return fallbackAnswer
  const text = (llmAnswer || '').trim()
  if (!text) return fallbackAnswer
  if (INCOMPLETE_ANSWER.test(text) && !/\d/.test(text)) return fallbackAnswer
  if (INCOMPLETE_ANSWER.test(text)) {
    return `${fallbackAnswer} ${text.replace(INCOMPLETE_ANSWER, '').trim()}`.trim()
  }
  if (
    fallbackAnswer &&
    !text.includes(String(fallbackAnswer.match(/\d+(\.\d+)?/)?.[0] ?? '__none__'))
  ) {
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
      charts: [],
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
        charts: [],
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

  const companyWide = /ignore filters|across the company|company-wide/i.test(question)
  const baseFilters: FilterContext = companyWide
    ? {
        ...request.filters,
        functions: [],
        locations: [],
        levelBands: [],
        tenureBands: [],
        crossFilter: null,
      }
    : request.filters

  const toolResult = await runWizardToolQuery(question, baseFilters)
  const historyCharts = findLastChartsInConversation(request.conversation)
  const wantsReport = /save.*(report|chart)|customized report/i.test(question)
  const toolCharts = toolResult.charts.filter((c) => c.points?.length)
  const groundedCharts = wantsReport && !toolCharts.length
    ? pickRenderableCharts(historyCharts, toolCharts)
    : pickRenderableCharts(toolCharts, historyCharts)

  const scopedFromQuestion = Boolean(toolResult.snapshot.function_scope)
  const filterOverridden =
    companyWide ||
    (scopedFromQuestion &&
      !(request.filters.functions ?? []).includes(
        String(toolResult.snapshot.function_scope),
      ))

  const groundedBase = {
    answer: toolResult.fallbackAnswer,
    citations: toolResult.citations,
    chart: groundedCharts[0] ?? null,
    charts: groundedCharts,
    filterOverridden,
    refused: false,
    refusalReason: null,
  }

  const artifactOpts = {
    question,
    charts: groundedCharts,
    citations: toolResult.citations,
    filters: toolResult.effectiveFilters,
    context: request.context,
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || toolResult.preferAuthoritative) {
    return withReportArtifacts(groundedBase, artifactOpts)
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
            filters: toolResult.effectiveFilters,
            filterOverridden,
            dashboardContext: request.context ?? null,
            conversation: request.conversation ?? [],
            measureSnapshot: toolResult.snapshot,
            authoritativeAnswer: toolResult.fallbackAnswer,
            instructions: [
              'Return a COMPLETE final answer now — never say you will look something up or do it later.',
              'Use ONLY numbers from measureSnapshot / authoritativeAnswer. Do not invent or round differently.',
              'If function_scope is set, scoped_active_headcount is that function’s headcount; company_active_headcount is company-wide — never confuse them.',
              'If the question asks for open roles/requisitions, use open_requisitions exactly.',
              'Do not invent chart points; leave chart null — the server attaches grounded charts.',
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
    return withReportArtifacts(groundedBase, artifactOpts)
  }

  const payload = (await completion.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = payload.choices?.[0]?.message?.content ?? '{}'
  let parsed: {
    answer?: string
    refused?: boolean
    refusalReason?: string | null
  }
  try {
    parsed = JSON.parse(content)
  } catch {
    parsed = { answer: toolResult.fallbackAnswer }
  }

  const rawAnswer = finalizeAnswer(
    parsed.answer,
    toolResult.fallbackAnswer,
    toolResult.preferAuthoritative,
  )
  const answer = guardFunctionHeadcountAnswer(
    rawAnswer,
    toolResult.snapshot,
    toolResult.fallbackAnswer,
  )

  return withReportArtifacts(
    {
      answer,
      citations: toolResult.citations,
      chart: groundedCharts[0] ?? null,
      charts: groundedCharts,
      filterOverridden,
      refused: Boolean(parsed.refused),
      refusalReason: parsed.refusalReason ?? null,
    },
    artifactOpts,
  )
}
