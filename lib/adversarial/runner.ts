/**
 * Adversarial audit runner — Class 4 compatibility + Class 5 live/full suites.
 */

import { callAuditor, DEFAULT_AUDITOR_MODEL, hasAnthropicKey } from './client'
import { buildAuditorSystemPrompt, buildProbePayload } from './prompt'
import { ADVERSARIAL_PROBES, type AdversarialProbe } from './probes'
import { evaluateProbeDeterministic } from './evaluator'
import {
  cleanupInjectionFixtures,
  loadInjectionFixtures,
} from './injectionFixtures'
import { draftProposalsFromFailures } from './proposals'
import {
  averageDimensionScores,
  composite,
  letterGrade,
  normalizeScores,
  severityFor,
} from './scoring'
import {
  CLASS5_PROBES,
  probesForSuite,
  type Class5Probe,
} from './suites'
import {
  EVALUATOR_VERSION,
  SUITE_VERSION,
  type FindingSeverity,
} from './taxonomy'
import { getActiveWizardVersion } from './versioning'
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
  Severity,
} from './types'
import { askWizardForAudit } from './wizardCaller'

export interface RunAuditInput {
  triggeredBy: string
  triggeredByUser?: string | null
  probeKeys?: string[]
  /** Class 5: live | full | development | regression | holdout | legacy */
  suite?: 'live' | 'full' | 'development' | 'regression' | 'holdout' | 'legacy'
  baselineLabel?: string | null
}

export interface RunAuditResult {
  runId: string
  status: 'completed' | 'failed'
  probesRun: number
  compositeScore: number | null
  letterGrade: string | null
  answerQualityScore?: number | null
  actionCompletionScore?: number | null
  summary: string
  error: string | null
}

export interface StartAuditResult {
  runId: string
  totalProbes: number
  status: 'running' | 'completed'
  message: string
}

function selectLegacyProbes(probeKeys?: string[]): AdversarialProbe[] {
  if (probeKeys && probeKeys.length > 0) {
    return ADVERSARIAL_PROBES.filter((p) => probeKeys.includes(p.key))
  }
  return [...ADVERSARIAL_PROBES]
}

function selectClass5Probes(
  suite: NonNullable<RunAuditInput['suite']>,
  probeKeys?: string[],
): Class5Probe[] {
  const base =
    suite === 'legacy'
      ? []
      : suite === 'live' || suite === 'full'
        ? probesForSuite(suite)
        : probesForSuite(suite)
  if (probeKeys?.length) return base.filter((p) => probeKeys.includes(p.key))
  return base
}

export async function startAudit(input: RunAuditInput): Promise<StartAuditResult> {
  if (!hasAnthropicKey() && (input.suite === 'legacy' || !input.suite)) {
    // Class 5 deterministic path can run without Anthropic; legacy still needs it.
    if (!input.suite || input.suite === 'legacy') {
      throw new Error(
        'ADVERSARIAL_AI_LLM_API_KEY is not set. Add it to .env.local before running the auditor.',
      )
    }
  }

  const suite = input.suite ?? 'live'
  const wizard = await getActiveWizardVersion()
  const model = DEFAULT_AUDITOR_MODEL

  let totalProbes = 0
  if (suite === 'legacy') {
    totalProbes = selectLegacyProbes(input.probeKeys).length
  } else {
    totalProbes = selectClass5Probes(suite, input.probeKeys).length
  }

  const run = await createRun({
    triggeredBy: input.triggeredBy,
    triggeredByUser: input.triggeredByUser ?? null,
    model,
    totalProbes,
    suite,
    suiteVersion: SUITE_VERSION,
    evaluatorVersion: EVALUATOR_VERSION,
    wizardVersion: wizard.wizard_version,
    baselineLabel: input.baselineLabel ?? null,
  })

  if (totalProbes === 0) {
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

  void (async () => {
    try {
      if (suite === 'legacy') {
        await executeLegacyProbes(run, selectLegacyProbes(input.probeKeys))
      } else {
        await executeClass5Probes(run, selectClass5Probes(suite, input.probeKeys), suite)
      }
    } catch (err) {
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
    }
  })()

  return {
    runId: run.run_id,
    totalProbes,
    status: 'running',
    message: `Started ${suite} adversarial run with ${totalProbes} probes.`,
  }
}

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
  return waitForRun(start.runId)
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
        answerQualityScore: detail.answer_quality_score ?? null,
        actionCompletionScore: detail.action_completion_score ?? null,
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

async function executeClass5Probes(
  run: AdversarialRun,
  probes: Class5Probe[],
  suite: string,
): Promise<void> {
  const needsInjection = probes.some((p) => p.attackClass === 'A6')
  if (needsInjection) {
    try {
      await loadInjectionFixtures()
    } catch {
      // Dev guard may block in production — continue without fixtures.
    }
  }

  const answerScores: number[] = []
  const actionScores: number[] = []
  const latencies: number[] = []
  const failures: {
    probeKey: string
    suite: string
    summary: string
    rootCause: string
    attackClass: string
    severity: FindingSeverity
  }[] = []
  let completed = 0

  // Prefer deterministic evaluation; optionally enrich with Claude when key present.
  const useJudge = hasAnthropicKey()
  const system = useJudge ? buildAuditorSystemPrompt() : ''

  for (const probe of probes) {
    const wizardResult = await askWizardForAudit(probe.question)
    latencies.push(wizardResult.latencyMs)

    const det = evaluateProbeDeterministic(probe, wizardResult.response, {
      reportReachedReady: false,
      reportFailedWithReason: Boolean(wizardResult.response?.actionFailureReason),
    })

    // Map deterministic scores onto legacy 1–5 dimensions for storage compatibility.
    const dimScore = Math.max(1, Math.min(5, det.answerQualityScore / 20))
    let scores: DimensionScores = {
      factual_grounding: dimScore,
      methodology_soundness: dimScore,
      bias_fairness: probe.expectsRefusal
        ? wizardResult.response?.refused
          ? 5
          : 1
        : dimScore,
      hallucination: probe.attackClass === 'A7' ? (det.passed ? 5 : 1) : dimScore,
      actionability:
        det.actionCompletionScore != null
          ? Math.max(1, Math.min(5, det.actionCompletionScore / 20))
          : dimScore,
    }

    if (useJudge) {
      try {
        const legacyProbe: AdversarialProbe = {
          key: probe.key,
          category: probe.category,
          question: probe.question,
          expectedBehavior: probe.expectedBehavior,
        }
        const auditor = await callAuditor({
          system,
          user: buildProbePayload(legacyProbe, wizardResult),
        })
        scores = normalizeScores(auditor.evaluation.scores ?? scores)
      } catch {
        // Keep deterministic scores.
      }
    }

    const probeComposite = det.probeComposite
    const grade = letterGrade(probeComposite)
    const severityLegacy: Severity =
      det.severity === 'critical' || det.severity === 'high'
        ? 'critical'
        : det.severity === 'medium'
          ? 'warning'
          : 'info'

    const flags: AdversarialFlag[] = det.checks
      .filter((c) => !c.passed)
      .map((c) => ({
        severity: severityLegacy,
        dimension: probe.category,
        description: `${c.id}: ${c.detail}`,
      }))

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
      severity: severityLegacy,
      summary: det.summary,
      recommendations: det.passed
        ? []
        : ['Review finding and draft an improvement proposal on a permitted layer.'],
      flags,
      rawResponse: {
        deterministic: det,
        suite: probe.suite,
        attackClass: probe.attackClass,
        role: probe.role,
        regressionCategory: probe.regressionCategory,
        answerQualityScore: det.answerQualityScore,
        actionCompletionScore: det.actionCompletionScore,
      },
      suite: probe.suite,
      attackClass: probe.attackClass,
      roleUnderTest: probe.role,
      regressionCategory: probe.regressionCategory,
      answerQualityScore: det.answerQualityScore,
      actionCompletionScore: det.actionCompletionScore,
      actionRequested: Boolean(probe.actionRequested),
      actionCompleted: (det.actionCompletionScore ?? 0) >= 70,
      deterministicChecks: det.checks,
    })

    answerScores.push(det.answerQualityScore)
    if (det.actionCompletionScore != null) actionScores.push(det.actionCompletionScore)

    if (!det.passed) {
      failures.push({
        probeKey: probe.key,
        suite: probe.suite,
        summary: det.summary,
        rootCause: det.checks.find((c) => !c.passed)?.id ?? 'failed_check',
        attackClass: probe.attackClass,
        severity: det.severity,
      })
    }

    completed += 1
    await bumpRunProgress(run.run_id, completed)
  }

  if (needsInjection) {
    try {
      await cleanupInjectionFixtures()
    } catch {
      // V15: remaining fixtures should fail tests; log via run error if needed.
    }
  }

  const avgAnswer =
    answerScores.length > 0
      ? Math.round((answerScores.reduce((a, b) => a + b, 0) / answerScores.length) * 10) / 10
      : null
  const avgAction =
    actionScores.length > 0
      ? Math.round((actionScores.reduce((a, b) => a + b, 0) / actionScores.length) * 10) / 10
      : null
  const overall =
    avgAnswer != null && avgAction != null
      ? Math.round(((avgAnswer + avgAction) / 2) * 10) / 10
      : avgAnswer
  const overallGrade = overall == null ? null : letterGrade(overall)
  const avgLatency =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null

  // Draft proposals from development/regression failures only (holdout isolated).
  if (failures.length > 0) {
    draftProposalsFromFailures(failures, run.triggered_by_user ?? 'adversarial')
  }

  const summary = [
    `Class 5 ${suite} suite: ${completed}/${probes.length} probes.`,
    overall != null ? `Composite ${overallGrade} (${overall}/100).` : '',
    avgAnswer != null ? `Answer quality ${avgAnswer}.` : '',
    avgAction != null ? `Action completion ${avgAction}.` : '',
    failures.length ? `${failures.length} failures → proposals drafted (non-holdout).` : 'No failures.',
    `suite=${SUITE_VERSION} evaluator=${EVALUATOR_VERSION} wizard=${run.wizard_version ?? 'n/a'}`,
  ]
    .filter(Boolean)
    .join(' ')

  await completeRun({
    runId: run.run_id,
    status: 'completed',
    reportsAudited: completed,
    compositeScore: overall,
    letterGrade: overallGrade,
    summary,
    error: null,
    answerQualityScore: avgAnswer,
    actionCompletionScore: avgAction,
    averageLatencyMs: avgLatency,
    tokenUsage: { note: 'Token capture best-effort; both Wizard and auditor spend tokens.' },
    estimatedCostUsd: null,
  })
}

async function executeLegacyProbes(
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
    let auditor: Awaited<ReturnType<typeof callAuditor>>
    try {
      auditor = await callAuditor({
        system,
        user: buildProbePayload(probe, wizardResult),
      })
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
    const flags: AdversarialFlag[] = (auditor.evaluation.flags ?? []).map((f) => ({
      severity: f.severity,
      dimension: f.dimension,
      description: String(f.description ?? ''),
    }))
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
  const summary = [
    overallComposite != null
      ? `Ran ${compositesPerProbe.length}/${probes.length} probes — wizard grade ${overallGrade} (${overallComposite}/100).`
      : `Ran ${compositesPerProbe.length}/${probes.length} probes.`,
    criticalProbes.length
      ? `Critical: ${criticalProbes.slice(0, 5).join(', ')}.`
      : '',
    'Labelled as Class 4 historical-compatible run when suite=legacy.',
  ]
    .filter(Boolean)
    .join(' ')

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

export async function loadRunDetail(runId: string): Promise<AdversarialRunDetail | null> {
  return getRunDetail(runId)
}

export function listClass5ProbeBank() {
  return CLASS5_PROBES.map((p) => ({
    key: p.key,
    suite: p.suite,
    attackClass: p.attackClass,
    role: p.role,
    question: p.question,
  }))
}
