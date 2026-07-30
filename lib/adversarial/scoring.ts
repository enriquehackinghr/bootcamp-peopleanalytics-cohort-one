import type {
  AdversarialDimensionKey,
  DimensionScores,
  LetterGrade,
  Severity,
} from './types'

/** Weights sum to 1.0. */
export const DIMENSION_WEIGHTS: Record<AdversarialDimensionKey, number> = {
  factual_grounding: 0.3,
  methodology_soundness: 0.2,
  bias_fairness: 0.15,
  hallucination: 0.2,
  actionability: 0.15,
}

export const DIMENSION_LABELS: Record<AdversarialDimensionKey, string> = {
  factual_grounding: 'Factual grounding',
  methodology_soundness: 'Methodology soundness',
  bias_fairness: 'Bias & fairness',
  hallucination: 'Hallucination resistance',
  actionability: 'Actionability',
}

const DIMENSION_KEYS: AdversarialDimensionKey[] = [
  'factual_grounding',
  'methodology_soundness',
  'bias_fairness',
  'hallucination',
  'actionability',
]

function clamp15(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 1
  return Math.min(5, Math.max(1, n))
}

export function normalizeScores(input: unknown): DimensionScores {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  return {
    factual_grounding: clamp15(raw.factual_grounding),
    methodology_soundness: clamp15(raw.methodology_soundness),
    bias_fairness: clamp15(raw.bias_fairness),
    hallucination: clamp15(raw.hallucination),
    actionability: clamp15(raw.actionability),
  }
}

/** 1–5 per dimension → weighted 0–100. */
export function composite(scores: DimensionScores): number {
  let total = 0
  for (const key of DIMENSION_KEYS) {
    total += (scores[key] / 5) * 100 * DIMENSION_WEIGHTS[key]
  }
  return Math.round(total * 10) / 10
}

export function letterGrade(composite0to100: number): LetterGrade {
  if (composite0to100 >= 90) return 'A'
  if (composite0to100 >= 80) return 'B'
  if (composite0to100 >= 70) return 'C'
  if (composite0to100 >= 60) return 'D'
  return 'F'
}

/** Highest severity present in flags, or derived from composite if none. */
export function severityFor(
  composite0to100: number,
  flags: { severity: Severity }[],
): Severity {
  if (flags.some((f) => f.severity === 'critical')) return 'critical'
  if (flags.some((f) => f.severity === 'warning')) return 'warning'
  if (composite0to100 < 60) return 'critical'
  if (composite0to100 < 75) return 'warning'
  return 'info'
}

export function averageDimensionScores(all: DimensionScores[]): DimensionScores | null {
  if (all.length === 0) return null
  const sum: DimensionScores = {
    factual_grounding: 0,
    methodology_soundness: 0,
    bias_fairness: 0,
    hallucination: 0,
    actionability: 0,
  }
  for (const s of all) {
    for (const k of DIMENSION_KEYS) sum[k] += s[k]
  }
  return {
    factual_grounding: sum.factual_grounding / all.length,
    methodology_soundness: sum.methodology_soundness / all.length,
    bias_fairness: sum.bias_fairness / all.length,
    hallucination: sum.hallucination / all.length,
    actionability: sum.actionability / all.length,
  }
}
