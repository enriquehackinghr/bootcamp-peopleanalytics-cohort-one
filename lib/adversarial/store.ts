import { randomUUID } from 'crypto'
import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import type {
  AdversarialDimensionKey,
  AdversarialFlag,
  AdversarialProbeResult,
  AdversarialRun,
  AdversarialRunDetail,
  DimensionScores,
  LetterGrade,
  Severity,
} from './types'

const memoryRuns = new Map<string, AdversarialRun>()
const memoryProbes = new Map<string, AdversarialProbeResult[]>()

export async function createRun(input: {
  triggeredBy: string
  triggeredByUser?: string | null
  model?: string
  totalProbes?: number
}): Promise<AdversarialRun> {
  const run: AdversarialRun = {
    run_id: randomUUID(),
    triggered_by: input.triggeredBy,
    triggered_by_user: input.triggeredByUser ?? null,
    status: 'running',
    model: input.model ?? null,
    reports_audited: 0,
    total_probes: input.totalProbes ?? null,
    composite_score: null,
    letter_grade: null,
    summary: null,
    error: null,
    started_at: new Date().toISOString(),
    completed_at: null,
  }

  memoryRuns.set(run.run_id, run)

  if (hasDatabaseConfig()) {
    const supabase = getServiceSupabase()
    await supabase.from('adversarial_runs').insert({
      run_id: run.run_id,
      triggered_by: run.triggered_by,
      triggered_by_user: run.triggered_by_user,
      status: run.status,
      model: run.model,
      reports_audited: run.reports_audited,
      total_probes: run.total_probes,
      started_at: run.started_at,
    })
  }
  return run
}

export async function bumpRunProgress(runId: string, reportsAudited: number): Promise<void> {
  const existing = memoryRuns.get(runId)
  if (existing) existing.reports_audited = reportsAudited
  if (hasDatabaseConfig()) {
    const supabase = getServiceSupabase()
    await supabase
      .from('adversarial_runs')
      .update({ reports_audited: reportsAudited })
      .eq('run_id', runId)
  }
}

export async function completeRun(input: {
  runId: string
  status: 'completed' | 'failed'
  reportsAudited: number
  compositeScore: number | null
  letterGrade: LetterGrade | null
  summary: string | null
  error: string | null
}): Promise<void> {
  const existing = memoryRuns.get(input.runId)
  const completedAt = new Date().toISOString()
  if (existing) {
    existing.status = input.status
    existing.reports_audited = input.reportsAudited
    existing.composite_score = input.compositeScore
    existing.letter_grade = input.letterGrade
    existing.summary = input.summary
    existing.error = input.error
    existing.completed_at = completedAt
  }
  if (hasDatabaseConfig()) {
    const supabase = getServiceSupabase()
    await supabase
      .from('adversarial_runs')
      .update({
        status: input.status,
        reports_audited: input.reportsAudited,
        composite_score: input.compositeScore,
        letter_grade: input.letterGrade,
        summary: input.summary,
        error: input.error,
        completed_at: completedAt,
      })
      .eq('run_id', input.runId)
  }
}

export async function saveProbeResult(input: {
  runId: string
  probeKey: string
  probeCategory: AdversarialDimensionKey
  probeQuestion: string
  expectedBehavior: string
  wizardAnswer: string | null
  wizardRefused: boolean | null
  wizardRefusalReason: string | null
  wizardLatencyMs: number | null
  wizardError: string | null
  wizardRaw: unknown
  scores: DimensionScores
  probeComposite: number
  probeGrade: LetterGrade
  severity: Severity
  summary: string
  recommendations: string[]
  flags: AdversarialFlag[]
  rawResponse: unknown
}): Promise<AdversarialProbeResult> {
  const probe: AdversarialProbeResult = {
    probe_result_id: randomUUID(),
    run_id: input.runId,
    probe_key: input.probeKey,
    probe_category: input.probeCategory,
    probe_question: input.probeQuestion,
    expected_behavior: input.expectedBehavior,
    wizard_answer: input.wizardAnswer,
    wizard_refused: input.wizardRefused,
    wizard_refusal_reason: input.wizardRefusalReason,
    wizard_latency_ms: input.wizardLatencyMs,
    wizard_error: input.wizardError,
    scores: input.scores,
    probe_composite: input.probeComposite,
    probe_grade: input.probeGrade,
    severity: input.severity,
    summary: input.summary,
    recommendations: input.recommendations,
    flags: input.flags,
    created_at: new Date().toISOString(),
  }

  const list = memoryProbes.get(input.runId) ?? []
  list.push(probe)
  memoryProbes.set(input.runId, list)

  if (hasDatabaseConfig()) {
    const supabase = getServiceSupabase()
    await supabase.from('adversarial_probes').insert({
      probe_result_id: probe.probe_result_id,
      run_id: probe.run_id,
      probe_key: probe.probe_key,
      probe_category: probe.probe_category,
      probe_question: probe.probe_question,
      expected_behavior: probe.expected_behavior,
      wizard_answer: probe.wizard_answer,
      wizard_refused: probe.wizard_refused,
      wizard_refusal_reason: probe.wizard_refusal_reason,
      wizard_latency_ms: probe.wizard_latency_ms,
      wizard_error: probe.wizard_error,
      wizard_raw: input.wizardRaw,
      factual_grounding: probe.scores.factual_grounding,
      methodology_soundness: probe.scores.methodology_soundness,
      bias_fairness: probe.scores.bias_fairness,
      hallucination: probe.scores.hallucination,
      actionability: probe.scores.actionability,
      probe_composite: probe.probe_composite,
      probe_grade: probe.probe_grade,
      severity: probe.severity,
      summary: probe.summary,
      recommendations: probe.recommendations,
      flags: probe.flags,
      raw_response: input.rawResponse,
      created_at: probe.created_at,
    })
  }
  return probe
}

export async function listRuns(limit = 30): Promise<AdversarialRun[]> {
  if (hasDatabaseConfig()) {
    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('adversarial_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit)
    if (!error && data) return data.map(rowToRun)
  }
  return [...memoryRuns.values()]
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, limit)
}

export async function getRunDetail(
  runId: string,
): Promise<AdversarialRunDetail | null> {
  let run: AdversarialRun | null = memoryRuns.get(runId) ?? null
  let probes: AdversarialProbeResult[] = memoryProbes.get(runId) ?? []

  if (hasDatabaseConfig()) {
    const supabase = getServiceSupabase()
    const { data: runRow } = await supabase
      .from('adversarial_runs')
      .select('*')
      .eq('run_id', runId)
      .maybeSingle()
    if (runRow) run = rowToRun(runRow)

    const { data: probeRows } = await supabase
      .from('adversarial_probes')
      .select('*')
      .eq('run_id', runId)
      .order('probe_composite', { ascending: true })
    if (probeRows) probes = probeRows.map(rowToProbe)
  }

  if (!run) return null
  return { ...run, probes }
}

function rowToRun(row: Record<string, unknown>): AdversarialRun {
  return {
    run_id: String(row.run_id),
    triggered_by: String(row.triggered_by ?? 'manual'),
    triggered_by_user: (row.triggered_by_user as string) ?? null,
    status: (row.status as AdversarialRun['status']) ?? 'pending',
    model: (row.model as string) ?? null,
    reports_audited: Number(row.reports_audited ?? 0),
    total_probes: row.total_probes == null ? null : Number(row.total_probes),
    composite_score:
      row.composite_score == null ? null : Number(row.composite_score),
    letter_grade: (row.letter_grade as LetterGrade) ?? null,
    summary: (row.summary as string) ?? null,
    error: (row.error as string) ?? null,
    started_at: String(row.started_at ?? new Date().toISOString()),
    completed_at: (row.completed_at as string) ?? null,
  }
}

function rowToProbe(row: Record<string, unknown>): AdversarialProbeResult {
  return {
    probe_result_id: String(row.probe_result_id),
    run_id: String(row.run_id),
    probe_key: String(row.probe_key ?? ''),
    probe_category: (row.probe_category as AdversarialDimensionKey) ?? 'factual_grounding',
    probe_question: String(row.probe_question ?? ''),
    expected_behavior: String(row.expected_behavior ?? ''),
    wizard_answer: (row.wizard_answer as string) ?? null,
    wizard_refused:
      row.wizard_refused == null ? null : Boolean(row.wizard_refused),
    wizard_refusal_reason: (row.wizard_refusal_reason as string) ?? null,
    wizard_latency_ms:
      row.wizard_latency_ms == null ? null : Number(row.wizard_latency_ms),
    wizard_error: (row.wizard_error as string) ?? null,
    scores: {
      factual_grounding: Number(row.factual_grounding ?? 0),
      methodology_soundness: Number(row.methodology_soundness ?? 0),
      bias_fairness: Number(row.bias_fairness ?? 0),
      hallucination: Number(row.hallucination ?? 0),
      actionability: Number(row.actionability ?? 0),
    },
    probe_composite: Number(row.probe_composite ?? 0),
    probe_grade: (row.probe_grade as LetterGrade) ?? 'F',
    severity: (row.severity as Severity) ?? 'info',
    summary: (row.summary as string) ?? '',
    recommendations: Array.isArray(row.recommendations)
      ? (row.recommendations as string[])
      : [],
    flags: Array.isArray(row.flags) ? (row.flags as AdversarialFlag[]) : [],
    created_at: String(row.created_at ?? new Date().toISOString()),
  }
}
