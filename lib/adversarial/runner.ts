import { callAuditor, DEFAULT_AUDITOR_MODEL, hasAnthropicKey } from './client'
import { buildAuditorSystemPrompt, buildProbePayload } from './prompt'
import { ADVERSARIAL_PROBES, type AdversarialProbe } from './probes'
import {
  averageDimensionScores,
  composite,
  letterGrade,
  normalizeScores,
  severityFor,
} from './scoring'
import {
  bumpRunProgress,
  completeRun,
  createRun,
  getRunDetail,
  saveProbeResult,
} from './store'
import type {
  AdversarialFlag,
  AdversarialRun,
  AdversarialRunDetail,
  DimensionScores,
} from './types'
import { askWizardForAudit } from './wizardCaller'

export interface RunAuditInput {
  triggeredBy: string
  triggeredByUser?: string | null
  probeKeys?: string[]
}

export interface RunAuditResult {
  runId: string
  status: 'completed' | 'failed'
  probesRun: number
  compositeScore: number | null
  letterGrade: string | null
  summary: string
  error: string | null
}

export interface StartAuditResult {
  runId: string
  totalProbes: number
  status: 'running' | 'completed'
  message: string
}

function selectProbes(probeKeys?: string[]): AdversarialProbe[] {
  if (probeKeys && probeKeys.length > 0) {
    return ADVERSARIAL_PROBES.filter((p) => probeKeys.includes(p.key))
  }
  return [...ADVERSARIAL_PROBES]
}

/**
 * Kicks off an adversarial run WITHOUT waiting for the probes to finish.
 * Returns immediately with the runId and total probe count so the client can
 * poll the run detail endpoint for live progress.
 */
export async function startAudit(input: RunAuditInput): Promise<StartAuditResult> {
  if (!hasAnthropicKey()) {
    throw new Error(
      'ADVERSARIAL_AI_LLM_API_KEY is not set. Add it to .env.local before running the auditor.',
    )
  }

  const probes = selectProbes(input.probeKeys)
  const model = DEFAULT_AUDITOR_MODEL
  const run = await createRun({
    triggeredBy: input.triggeredBy,
    triggeredByUser: input.triggeredByUser ?? null,
    model,
    totalProbes: probes.length,
  })

  if (probes.length === 0) {
    const summary = 'No probes selected — nothing to run.'
    await completeRun({
      runId: run.run_id,
      status: 'completed',
      reportsAudited: 0,
      compositeScore: null,
      letterGrade: null,
      summary,
      error: null,
    })
    return {
      runId: run.run_id,
      totalProbes: 0,
      status: 'completed',
      message: summary,
    }
  }

  // Fire-and-forget the actual probe execution.
  void executeProbes(run, probes).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err)
    await completeRun({
      runId: run.run_id,
      status: 'failed',
      reportsAudited: 0,
      compositeScore: null,
      letterGrade: null,
      summary: null,
      error: message,
    })
  })

  return {
    runId: run.run_id,
    totalProbes: probes.length,
    status: 'running',
    message: `Started adversarial run with ${probes.length} probes.`,
  }
}

/** Blocking variant — used by cron so the process stays alive until done. */
export async function runAudit(input: RunAuditInput): Promise<RunAuditResult> {
  const start = await startAudit(input)
  if (start.status === 'completed') {
    return {
      runId: start.runId,
      status: 'completed',
      probesRun: 0,
      compositeScore: null,
      letterGrade: null,
      summary: start.message,
      error: null,
    }
  }
  return await waitForRun(start.runId)
}

async function waitForRun(runId: string): Promise<RunAuditResult> {
  const timeoutMs = 15 * 60 * 1000
  const pollMs = 2000
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const detail = await getRunDetail(runId)
    if (detail && (detail.status === 'completed' || detail.status === 'failed')) {
      return {
        runId,
        status: detail.status,
        probesRun: detail.reports_audited,
        compositeScore: detail.composite_score,
        letterGrade: detail.letter_grade ?? null,
        summary: detail.summary ?? detail.error ?? '',
        error: detail.error,
      }
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }
  return {
    runId,
    status: 'failed',
    probesRun: 0,
    compositeScore: null,
    letterGrade: null,
    summary: 'Timed out waiting for adversarial run to complete.',
    error: 'timeout',
  }
}

async function executeProbes(
  run: AdversarialRun,
  probes: AdversarialProbe[],
): Promise<void> {
  const system = buildAuditorSystemPrompt()
  const compositesPerProbe: number[] = []
  const scoresPerProbe: DimensionScores[] = []
  const criticalProbes: string[] = []
  let completed = 0

  for (const probe of probes) {
    const wizardResult = await askWizardForAudit(probe.question)
    const user = buildProbePayload(probe, wizardResult)

    let auditor: Awaited<ReturnType<typeof callAuditor>>
    try {
      auditor = await callAuditor({ system, user })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await saveProbeResult({
        runId: run.run_id,
        probeKey: probe.key,
        probeCategory: probe.category,
        probeQuestion: probe.question,
        expectedBehavior: probe.expectedBehavior,
        wizardAnswer: wizardResult.response?.answer ?? null,
        wizardRefused: wizardResult.response?.refused ?? null,
        wizardRefusalReason: wizardResult.response?.refusalReason ?? null,
        wizardLatencyMs: wizardResult.latencyMs,
        wizardError: wizardResult.error,
        wizardRaw: wizardResult.response,
        scores: {
          factual_grounding: 1,
          methodology_soundness: 1,
          bias_fairness: 1,
          hallucination: 1,
          actionability: 1,
        },
        probeComposite: 0,
        probeGrade: 'F',
        severity: 'critical',
        summary: `Auditor call failed: ${message.slice(0, 200)}`,
        recommendations: ['Retry this probe after resolving the auditor error.'],
        flags: [
          {
            severity: 'critical',
            dimension: probe.category,
            description: `Auditor unreachable: ${message.slice(0, 200)}`,
          },
        ],
        rawResponse: { error: message },
      })
      criticalProbes.push(probe.key)
      completed += 1
      await bumpRunProgress(run.run_id, completed)
      continue
    }

    const scores = normalizeScores(auditor.evaluation.scores ?? {})
    const probeComposite = composite(scores)
    const grade = letterGrade(probeComposite)
    const flags: AdversarialFlag[] = (auditor.evaluation.flags ?? []).map(
      (f) => ({
        severity: f.severity,
        dimension: f.dimension,
        description: String(f.description ?? ''),
      }),
    )
    const severity = severityFor(probeComposite, flags)
    if (severity === 'critical') criticalProbes.push(probe.key)

    await saveProbeResult({
      runId: run.run_id,
      probeKey: probe.key,
      probeCategory: probe.category,
      probeQuestion: probe.question,
      expectedBehavior: probe.expectedBehavior,
      wizardAnswer: wizardResult.response?.answer ?? null,
      wizardRefused: wizardResult.response?.refused ?? null,
      wizardRefusalReason: wizardResult.response?.refusalReason ?? null,
      wizardLatencyMs: wizardResult.latencyMs,
      wizardError: wizardResult.error,
      wizardRaw: wizardResult.response,
      scores,
      probeComposite,
      probeGrade: grade,
      severity,
      summary: String(auditor.evaluation.summary ?? '').slice(0, 600),
      recommendations: Array.isArray(auditor.evaluation.recommendations)
        ? auditor.evaluation.recommendations.map((r) => String(r).slice(0, 400))
        : [],
      flags,
      rawResponse: auditor.evaluation,
    })

    compositesPerProbe.push(probeComposite)
    scoresPerProbe.push(scores)
    completed += 1
    await bumpRunProgress(run.run_id, completed)
  }

  const avgScores = averageDimensionScores(scoresPerProbe)
  const overallComposite = avgScores ? composite(avgScores) : null
  const overallGrade = overallComposite == null ? null : letterGrade(overallComposite)
  const summary = buildRunSummary({
    total: probes.length,
    run: compositesPerProbe.length,
    overallComposite,
    overallGrade,
    criticalProbes,
  })

  await completeRun({
    runId: run.run_id,
    status: 'completed',
    reportsAudited: compositesPerProbe.length,
    compositeScore: overallComposite,
    letterGrade: overallGrade,
    summary,
    error: null,
  })
}

function buildRunSummary(input: {
  total: number
  run: number
  overallComposite: number | null
  overallGrade: string | null
  criticalProbes: string[]
}): string {
  const parts: string[] = []
  if (input.overallComposite != null) {
    parts.push(
      `Ran ${input.run}/${input.total} probes — wizard grade ${input.overallGrade} (${input.overallComposite}/100).`,
    )
  } else {
    parts.push(`Ran ${input.run}/${input.total} probes.`)
  }
  if (input.criticalProbes.length > 0) {
    const shown = input.criticalProbes.slice(0, 5).join(', ')
    const extra =
      input.criticalProbes.length > 5
        ? ` (+${input.criticalProbes.length - 5} more)`
        : ''
    parts.push(`Critical: ${shown}${extra}.`)
  }
  return parts.join(' ')
}

export async function loadRunDetail(runId: string): Promise<AdversarialRunDetail | null> {
  return getRunDetail(runId)
}
