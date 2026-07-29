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

/**
 * Fold cross-filter + org drill path into dimension arrays so existing
 * employee_in_filters RPCs and chart builders honor CAP-3 / CAP-6.
 */
export function effectiveFilters(filters: FilterContext): FilterContext {
  const next: FilterContext = {
    ...filters,
    functions: [...filters.functions],
    locations: [...filters.locations],
    levelBands: [...filters.levelBands],
    tenureBands: [...filters.tenureBands],
    period: { ...filters.period },
    crossFilter: filters.crossFilter,
    drill: filters.drill,
  }

  if (filters.crossFilter) {
    const { dimension, value } = filters.crossFilter
    const dim = dimension.toLowerCase()
    if (dim === 'function' || dim === 'function_name') {
      if (!next.functions.includes(value)) next.functions = [...next.functions, value]
    } else if (
      dim === 'location' ||
      dim === 'office' ||
      dim === 'country' ||
      dim === 'geography'
    ) {
      if (!next.locations.includes(value)) next.locations = [...next.locations, value]
    } else if (dim === 'level' || dim === 'level_band' || dim === 'career_level') {
      if (!next.levelBands.includes(value)) next.levelBands = [...next.levelBands, value]
    } else if (dim === 'tenure' || dim === 'tenure_band') {
      if (!next.tenureBands.includes(value)) next.tenureBands = [...next.tenureBands, value]
    }
  }

  if (filters.drill?.hierarchy === 'org' && filters.drill.path.length) {
    const [fn, , level] = filters.drill.path
    if (fn && !next.functions.includes(fn)) next.functions = [...next.functions, fn]
    if (level && !next.levelBands.includes(level)) {
      // career_level values may not map 1:1 to IC/Manager/Director+ bands;
      // still pass through so TS chart filters can match exact levels.
      next.levelBands = [...next.levelBands, level]
    }
  }

  return next
}

/** Shape passed into metrics.* SQL functions (jsonb). */
export function filtersToJson(filters: FilterContext): Record<string, unknown> {
  const f = effectiveFilters(filters)
  return {
    functions: f.functions,
    locations: f.locations,
    levelBands: f.levelBands,
    tenureBands: f.tenureBands,
    period: f.period,
    comparison: f.comparison,
    crossFilter: f.crossFilter,
    drill: f.drill,
  }
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    return {} as T
  }
}
