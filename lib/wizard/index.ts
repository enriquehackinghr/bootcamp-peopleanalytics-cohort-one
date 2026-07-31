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
import { listActiveToolNames } from '@/lib/wizard/catalog'
import { getActiveWizardVersion } from '@/lib/adversarial/versioning'
import { saveReport } from '@/lib/reports/store'

const REFUSAL_PATTERNS: { pattern: RegExp; reason: string; alternative: string }[] = [
  {
    pattern: /\b(gender|race|ethnicity|veteran|disability|date of birth|age band|demographic)\b/i,
    reason: 'demographic_channel_restriction',
    alternative:
      'Demographic fields are excluded from the Wizard in v0.4 for every role. Authorized executives and admins can use the governed dashboard analytics views instead.',
  },
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
    actionIncomplete?: boolean
    actionFailureReason?: string | null
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
    actionIncomplete: wantsReport && !reportSpec ? true : base.actionIncomplete,
    actionFailureReason:
      wantsReport && !reportSpec
        ? 'Could not build a previewable report spec yet — confirm once a chart is available, or the failure is stated here rather than hidden behind a repeated number.'
        : base.actionFailureReason,
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
  const wizardBundle = await getActiveWizardVersion()

  // Explicit confirm → persist report to ready (P3).
  if (request.confirmAction?.type === 'create_customized_report') {
    const payload = request.confirmAction.payload as {
      spec?: Partial<CustomizedReportSpec>
    }
    const draft = payload.spec
    if (!draft) {
      return {
        answer: 'The request could not be completed — missing report specification.',
        citations: [],
        chart: null,
        charts: [],
        filterOverridden: false,
        refused: false,
        refusalReason: null,
        actionIncomplete: true,
        actionFailureReason: 'missing_report_spec',
        wizardVersion: wizardBundle.wizard_version,
      }
    }
    const saved = await saveReport(
      {
        ...draft,
        lifecycle_state: 'confirmed',
        wizard_version: wizardBundle.wizard_version,
        reporting_boundary: request.reportingBoundary ?? null,
        methodology_version: draft.methodology_version ?? 'class5-v0.5',
        report_spec_version: 'report-spec-v1',
      },
      { createdBy: request.sessionRole ?? 'wizard' },
    )
    if (saved.error || !saved.report) {
      return {
        answer: `Report creation failed: ${saved.error ?? 'unknown error'}. The failure is stated clearly — this is not a completed report.`,
        citations: [],
        chart: null,
        charts: [],
        filterOverridden: false,
        refused: false,
        refusalReason: null,
        actionIncomplete: true,
        actionFailureReason: saved.error ?? 'save_failed',
        wizardVersion: wizardBundle.wizard_version,
        reportSpec: { ...draft, lifecycle_state: 'failed', failure_reason: saved.error },
      }
    }
    return {
      answer: `Customized report “${saved.report.title}” is ready (id ${saved.report.id}). It appears in Customized Reports and can be reopened or exported.`,
      citations: [],
      chart: saved.report.visuals[0]?.chart ?? null,
      charts: saved.report.visuals.map((v) => v.chart),
      filterOverridden: false,
      refused: false,
      refusalReason: null,
      wizardVersion: wizardBundle.wizard_version,
      reportSpec: saved.report,
      proposedActions: [
        {
          type: 'open_page',
          label: 'Open saved report',
          requiresConfirmation: false,
          payload: { href: `/customized-reports/${saved.report.id}` },
        },
      ],
    }
  }

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
      wizardVersion: wizardBundle.wizard_version,
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
        wizardVersion: wizardBundle.wizard_version,
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

  const activeTools = listActiveToolNames(request.sessionRole ?? 'viewer')
  const enrichedCitations: WizardCitation[] = toolResult.citations.map((c) => ({
    ...c,
    toolName: c.measureId,
    scope: request.sessionRole
      ? `${request.sessionRole}; visible=${request.visibleScopeSize ?? 'n/a'}`
      : 'session',
    asOfDate: request.reportingBoundary ?? undefined,
    dataLoadId: request.dataLoadId ?? undefined,
    population: request.visibleScopeSize ?? null,
    suppression: 'threshold n<5',
    definitionRef: c.measureId,
  }))

  const citationFooter = request.reportingBoundary
    ? `\n\nSource: ${enrichedCitations.map((c) => c.toolName || c.measureId).join(', ') || 'dashboard measures'} · role: ${request.sessionRole ?? 'unknown'} · as of ${request.reportingBoundary} (derived reporting boundary) · data load: ${request.dataLoadId ?? 'active'} · active tools: ${activeTools.length}`
    : ''

  const groundedBase = {
    answer: focusAnswer(question, `${toolResult.fallbackAnswer}${citationFooter}`),
    citations: enrichedCitations,
    chart: groundedCharts[0] ?? null,
    charts: groundedCharts,
    filterOverridden,
    refused: false,
    refusalReason: null,
    wizardVersion: wizardBundle.wizard_version,
  }

  const artifactOpts = {
    question,
    charts: groundedCharts,
    citations: enrichedCitations,
    filters: toolResult.effectiveFilters,
    context: request.context,
  }

  // Metric-specific methodology — do not dump platform catalog.
  if (/how (is|do you|are).*(calculat|comput|defin)|methodology for/i.test(question)) {
    const metricMethod = metricSpecificMethodology(question, toolResult.fallbackAnswer)
    return withReportArtifacts(
      {
        ...groundedBase,
        answer: `${metricMethod}${citationFooter}`,
      },
      artifactOpts,
    )
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || toolResult.preferAuthoritative) {
    return withReportArtifacts(groundedBase, artifactOpts)
  }

  const system = `${buildWizardSystemPrompt(activeTools)}\n\n${wizardBundle.report_action_instructions}`
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
              'Stay relevant: do not append unrelated attrition metrics to a headcount question.',
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
  const answer = focusAnswer(
    question,
    guardFunctionHeadcountAnswer(
      rawAnswer,
      toolResult.snapshot,
      toolResult.fallbackAnswer,
    ),
  )

  return withReportArtifacts(
    {
      answer: `${answer}${citationFooter}`,
      citations: toolResult.citations,
      chart: groundedCharts[0] ?? null,
      charts: groundedCharts,
      filterOverridden,
      refused: Boolean(parsed.refused),
      refusalReason: parsed.refusalReason ?? null,
      wizardVersion: wizardBundle.wizard_version,
    },
    artifactOpts,
  )
}

/** Strip unrequested attrition drive-bys from focused headcount answers. */
function focusAnswer(question: string, answer: string): string {
  const asksHeadcount = /headcount|how many active|active employees/i.test(question)
  const asksAttrition = /attrition/i.test(question)
  if (!asksHeadcount || asksAttrition) return answer
  const lines = answer.split(/\n/)
  const kept = lines.filter((line) => !/\b(voluntary|involuntary|regrettable)\s+attrition\b|\battrition\s+rate\b/i.test(line))
  return kept.join('\n').trim() || answer
}

function metricSpecificMethodology(question: string, fallback: string): string {
  if (/voluntary/i.test(question)) {
    return [
      'Voluntary attrition (metric-specific): employee-initiated separations ÷ average active headcount over the selected period (typically TTM).',
      'Formula: voluntary_separations / average_active_headcount.',
      'Source: termination_history + employee_snapshots.',
      'Limitation: involuntary and regrettable attrition are separate measures and must not be blended.',
      'Full platform catalog: /methodology#voluntary_attrition_rate',
      fallback ? `\nGrounded snapshot: ${fallback}` : '',
    ].join(' ')
  }
  if (/engagement/i.test(question)) {
    return [
      'Engagement methodology is instrument-specific.',
      'Survey waves use a 1–5 Likert scale (aggregate only).',
      'Individual engagement_score_history uses 0–10 per employee.',
      'These instruments must never share an axis or be averaged together.',
      'Full catalog: /methodology#engagement_survey',
    ].join(' ')
  }
  if (/headcount|active employee/i.test(question)) {
    return [
      'Active headcount: count of employees with employment_status in {Active, On Leave} as of the derived reporting boundary from the current data load.',
      'Source: employees / employee_snapshots.',
      'Limitation: not a live headcount as of calendar “today” unless the boundary equals today.',
      'Full catalog: /methodology',
    ].join(' ')
  }
  return [
    'Metric-specific methodology for the requested measure (not the full platform catalog).',
    fallback || 'See /methodology for the linked definition, formula, source tables, and limitations.',
  ].join(' ')
}
