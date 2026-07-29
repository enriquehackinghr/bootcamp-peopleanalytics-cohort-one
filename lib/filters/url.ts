import {
  EMPTY_FILTER_CONTEXT,
  type ComparisonMode,
  type FilterContext,
  type HierarchyId,
  type PeriodGrain,
} from '@/lib/types'

function csv(values: string[]): string | null {
  return values.length ? values.join(',') : null
}

function splitCsv(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Serialize filter context to URL search params (CAP-1 / CAP-14). */
export function filtersToSearchParams(filters: FilterContext): URLSearchParams {
  const params = new URLSearchParams()
  const fn = csv(filters.functions)
  const loc = csv(filters.locations)
  const level = csv(filters.levelBands)
  const tenure = csv(filters.tenureBands)
  if (fn) params.set('fn', fn)
  if (loc) params.set('loc', loc)
  if (level) params.set('level', level)
  if (tenure) params.set('tenure', tenure)
  if (filters.period.grain !== 'ttm') params.set('grain', filters.period.grain)
  if (filters.period.asOfDate) params.set('asOf', filters.period.asOfDate)
  if (filters.comparison !== 'prior_period') params.set('cmp', filters.comparison)
  if (filters.crossFilter) {
    params.set('xfDim', filters.crossFilter.dimension)
    params.set('xfVal', filters.crossFilter.value)
  }
  if (filters.drill?.hierarchy && filters.drill.path.length) {
    params.set('drill', filters.drill.hierarchy)
    params.set('dpath', filters.drill.path.join('|'))
  }
  return params
}

export function searchParamsToFilters(
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
): FilterContext {
  const grain = (params.get('grain') as PeriodGrain | null) ?? 'ttm'
  const comparison = (params.get('cmp') as ComparisonMode | null) ?? 'prior_period'
  const xfDim = params.get('xfDim')
  const xfVal = params.get('xfVal')
  const drill = params.get('drill') as HierarchyId | null
  const dpath = params.get('dpath')

  return {
    functions: splitCsv(params.get('fn')),
    locations: splitCsv(params.get('loc')),
    levelBands: splitCsv(params.get('level')),
    tenureBands: splitCsv(params.get('tenure')),
    period: {
      grain: ['month', 'quarter', 'year', 'ttm'].includes(grain) ? grain : 'ttm',
      asOfDate: params.get('asOf'),
    },
    comparison: ['none', 'prior_period', 'same_period_last_year'].includes(comparison)
      ? comparison
      : 'prior_period',
    crossFilter: xfDim && xfVal ? { dimension: xfDim, value: xfVal } : null,
    drill:
      drill && dpath
        ? { hierarchy: drill, path: dpath.split('|').filter(Boolean) }
        : null,
  }
}

export function filtersEqual(a: FilterContext, b: FilterContext): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function isDefaultFilters(filters: FilterContext): boolean {
  return filtersEqual(filters, EMPTY_FILTER_CONTEXT)
}

type ReadonlyURLSearchParamsLike = {
  get(name: string): string | null
}
