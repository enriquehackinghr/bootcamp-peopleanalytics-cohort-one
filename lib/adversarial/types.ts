export type AdversarialDimensionKey =
  | 'factual_grounding'
  | 'methodology_soundness'
  | 'bias_fairness'
  | 'hallucination'
  | 'actionability'

export type Severity = 'critical' | 'warning' | 'info'

export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface DimensionScores {
  factual_grounding: number
  methodology_soundness: number
  bias_fairness: number
  hallucination: number
  actionability: number
}

export interface AdversarialFlag {
  severity: Severity
  dimension: AdversarialDimensionKey
  description: string
}

export interface AuditorReportEvaluation {
  scores: DimensionScores
  summary: string
  recommendations: string[]
  flags: AdversarialFlag[]
}

export interface AdversarialProbeResult {
  probe_result_id: string
  run_id: string
  probe_key: string
  probe_category: AdversarialDimensionKey
  probe_question: string
  expected_behavior: string
  wizard_answer: string | null
  wizard_refused: boolean | null
  wizard_refusal_reason: string | null
  wizard_latency_ms: number | null
  wizard_error: string | null
  scores: DimensionScores
  probe_composite: number
  probe_grade: LetterGrade
  severity: Severity
  summary: string
  recommendations: string[]
  flags: AdversarialFlag[]
  created_at: string
}

export interface AdversarialRun {
  run_id: string
  triggered_by: string
  triggered_by_user: string | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  model: string | null
  reports_audited: number
  total_probes: number | null
  composite_score: number | null
  letter_grade: LetterGrade | null
  summary: string | null
  error: string | null
  started_at: string
  completed_at: string | null
}

export interface AdversarialRunDetail extends AdversarialRun {
  probes: AdversarialProbeResult[]
}
