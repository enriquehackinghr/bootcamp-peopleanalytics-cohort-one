/**
 * MetricResult helpers — zero vs no_data must never be conflated.
 */

import type { CitationContract, MetricResult, MetricResultStatus } from '@/lib/types'

export const METRIC_STATUS_NARRATION: Record<MetricResultStatus, string> = {
  value: 'The result is zero.', // overridden for non-zero below
  no_data: 'No data is available for this measure in the selected context.',
  unavailable: 'That measure is not available in this build.',
  suppressed:
    'The result is suppressed because the population is below the disclosure threshold.',
  error: 'The request could not be completed.',
}

export function narrateMetricResult(result: MetricResult): string {
  if (result.status === 'value') {
    if (result.value === 0 || result.value === '0') return 'The result is zero.'
    return `The result is ${String(result.value)}.`
  }
  return result.reason || METRIC_STATUS_NARRATION[result.status]
}

export function metricValue<T>(
  value: T,
  citation?: CitationContract | null,
  populationCount?: number | null,
): MetricResult<T> {
  return {
    status: 'value',
    value,
    reason: null,
    population_count: populationCount ?? null,
    citation: citation ?? null,
  }
}

export function metricNoData(
  reason = 'No data is available for this measure in the selected context.',
  citation?: CitationContract | null,
): MetricResult {
  return {
    status: 'no_data',
    value: null,
    reason,
    population_count: 0,
    citation: citation ?? null,
  }
}

export function metricUnavailable(
  reason = 'That measure is not available in this build.',
): MetricResult {
  return {
    status: 'unavailable',
    value: null,
    reason,
    population_count: null,
    citation: null,
  }
}

export function metricSuppressed(
  reason = 'The result is suppressed because the population is below the disclosure threshold.',
  populationCount?: number | null,
): MetricResult {
  return {
    status: 'suppressed',
    value: null,
    reason,
    population_count: populationCount ?? null,
    citation: null,
  }
}

export function metricError(reason: string): MetricResult {
  return {
    status: 'error',
    value: null,
    reason,
    population_count: null,
    citation: null,
  }
}
