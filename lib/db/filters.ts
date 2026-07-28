import type { FilterContext } from '@/lib/types'
import { EMPTY_FILTER_CONTEXT } from '@/lib/types'

export function parseFilterContext(input: unknown): FilterContext {
  if (!input || typeof input !== 'object') {
    return { ...EMPTY_FILTER_CONTEXT }
  }

  const raw = input as Partial<FilterContext>
  return {
    functions: Array.isArray(raw.functions) ? raw.functions.map(String) : [],
    locations: Array.isArray(raw.locations) ? raw.locations.map(String) : [],
    levelBands: Array.isArray(raw.levelBands) ? raw.levelBands.map(String) : [],
    tenureBands: Array.isArray(raw.tenureBands) ? raw.tenureBands.map(String) : [],
    period: {
      grain: raw.period?.grain ?? 'ttm',
      asOfDate: raw.period?.asOfDate ?? null,
    },
    comparison: raw.comparison ?? 'prior_period',
    crossFilter: raw.crossFilter ?? null,
    drill: raw.drill ?? null,
  }
}

/** Shape passed into metrics.* SQL functions (jsonb). */
export function filtersToJson(filters: FilterContext): Record<string, unknown> {
  return {
    functions: filters.functions,
    locations: filters.locations,
    levelBands: filters.levelBands,
    tenureBands: filters.tenureBands,
    period: filters.period,
    comparison: filters.comparison,
    crossFilter: filters.crossFilter,
    drill: filters.drill,
  }
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    return {} as T
  }
}
