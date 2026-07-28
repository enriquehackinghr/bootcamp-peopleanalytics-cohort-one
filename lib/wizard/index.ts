import type { FilterContext, WizardRequest, WizardResponse } from '@/lib/types'
import { buildWizardSystemPrompt } from '@/lib/wizard/prompt'
import { runWizardToolQuery } from '@/lib/wizard/tools'

const REFUSAL_PATTERNS = [
  /salary of\s+\w+/i,
  /compensation for\s+[A-Z][a-z]+/i,
  /performance (of|for)\s+[A-Z][a-z]+/i,
  /who (said|wrote|answered).*(engagement|survey)/i,
]

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
    }
  }

  for (const pattern of REFUSAL_PATTERNS) {
    if (pattern.test(question)) {
      return {
        answer:
          'I can’t share individual-level compensation or performance for a named employee, or anything that could identify an engagement survey respondent.',
        citations: [],
        chart: null,
        filterOverridden: false,
        refused: true,
        refusalReason: 'privacy_refusal',
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

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return {
      answer: toolResult.fallbackAnswer,
      citations: toolResult.citations,
      chart: toolResult.chart,
      filterOverridden,
      refused: false,
      refusalReason: null,
    }
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
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: JSON.stringify({
            question,
            filters: effectiveFilters,
            filterOverridden,
            measureSnapshot: toolResult.snapshot,
            instructions:
              'Answer using only the measureSnapshot and citations. If a chart helps, return chartSpec matching WizardChartSpec; otherwise null.',
          }),
        },
      ],
      response_format: { type: 'json_object' },
    }),
  })

  if (!completion.ok) {
    const text = await completion.text()
    console.error('OpenAI error', text)
    return {
      answer: toolResult.fallbackAnswer,
      citations: toolResult.citations,
      chart: toolResult.chart,
      filterOverridden,
      refused: false,
      refusalReason: null,
    }
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
    answer: parsed.answer || toolResult.fallbackAnswer,
    citations: toolResult.citations,
    chart: parsed.chart ?? toolResult.chart,
    filterOverridden,
    refused: Boolean(parsed.refused),
    refusalReason: parsed.refusalReason ?? null,
  }
}
