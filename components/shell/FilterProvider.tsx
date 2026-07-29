'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  filtersEqual,
  filtersToSearchParams,
  isDefaultFilters,
  searchParamsToFilters,
} from '@/lib/filters/url'
import {
  EMPTY_FILTER_CONTEXT,
  HIERARCHIES,
  type ComparisonMode,
  type FilterContext,
  type FilterMetaResponse,
  type HierarchyId,
  type PeriodGrain,
} from '@/lib/types'

type FilterProviderValue = {
  filters: FilterContext
  meta: FilterMetaResponse | null
  setFilters: (next: FilterContext | ((prev: FilterContext) => FilterContext)) => void
  setDimension: (
    key: 'functions' | 'locations' | 'levelBands' | 'tenureBands',
    values: string[],
  ) => void
  setComparison: (mode: ComparisonMode) => void
  setPeriodGrain: (grain: PeriodGrain) => void
  setCrossFilter: (arg: { dimension: string; value: string } | null) => void
  clearCrossFilter: () => void
  drillInto: (hierarchy: HierarchyId, path: string[]) => void
  drillUpTo: (index: number) => void
  clearFilters: () => void
  copyViewLink: () => Promise<string>
}

const FilterContextReact = createContext<FilterProviderValue | null>(null)

export function FilterProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [filters, setFiltersState] = useState<FilterContext>(() =>
    searchParamsToFilters(searchParams),
  )
  const [meta, setMeta] = useState<FilterMetaResponse | null>(null)

  // Hydrate from URL when the query string changes (back/forward, shared links).
  useEffect(() => {
    const fromUrl = searchParamsToFilters(searchParams)
    setFiltersState((prev) => (filtersEqual(prev, fromUrl) ? prev : fromUrl))
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    async function loadMeta() {
      try {
        const res = await fetch('/api/filters/meta')
        const data = await res.json()
        if (!cancelled && res.ok) setMeta(data as FilterMetaResponse)
      } catch {
        if (!cancelled) {
          setMeta({
            hierarchies: HIERARCHIES,
            functions: [],
            locations: [],
            levelBands: ['IC', 'Manager', 'Director+'],
            tenureBands: ['0-1 years', '1-2 years', '2-5 years', '5+ years'],
            freshness: {
              lastLoadedAt: null,
              asOfDate: null,
              sourceSummary: null,
              sources: [],
            },
            minCellSize: 5,
          })
        }
      }
    }
    void loadMeta()
    return () => {
      cancelled = true
    }
  }, [])

  const syncUrl = useCallback(
    (next: FilterContext) => {
      const params = filtersToSearchParams(next)
      const qs = params.toString()
      const href = qs ? `${pathname}?${qs}` : pathname
      const current = searchParams.toString()
      if (qs === current) return
      router.replace(href, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const setFilters = useCallback(
    (next: FilterContext | ((prev: FilterContext) => FilterContext)) => {
      setFiltersState((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next
        syncUrl(resolved)
        return resolved
      })
    },
    [syncUrl],
  )

  const setDimension = useCallback(
    (
      key: 'functions' | 'locations' | 'levelBands' | 'tenureBands',
      values: string[],
    ) => {
      setFilters((prev) => ({ ...prev, [key]: values }))
    },
    [setFilters],
  )

  const setComparison = useCallback(
    (mode: ComparisonMode) => {
      setFilters((prev) => ({ ...prev, comparison: mode }))
    },
    [setFilters],
  )

  const setPeriodGrain = useCallback(
    (grain: PeriodGrain) => {
      setFilters((prev) => ({
        ...prev,
        period: { ...prev.period, grain },
      }))
    },
    [setFilters],
  )

  const setCrossFilter = useCallback(
    (arg: { dimension: string; value: string } | null) => {
      setFilters((prev) => {
        if (!arg) return { ...prev, crossFilter: null }
        // Toggle off if the same mark is clicked again (CAP-3).
        if (
          prev.crossFilter?.dimension === arg.dimension &&
          prev.crossFilter?.value === arg.value
        ) {
          return { ...prev, crossFilter: null }
        }
        return { ...prev, crossFilter: arg }
      })
    },
    [setFilters],
  )

  const clearCrossFilter = useCallback(() => {
    setCrossFilter(null)
  }, [setCrossFilter])

  const drillInto = useCallback(
    (hierarchy: HierarchyId, path: string[]) => {
      setFilters((prev) => ({
        ...prev,
        drill: { hierarchy, path },
        crossFilter: null,
      }))
    },
    [setFilters],
  )

  const drillUpTo = useCallback(
    (index: number) => {
      setFilters((prev) => {
        if (!prev.drill) return prev
        if (index < 0) return { ...prev, drill: null }
        return {
          ...prev,
          drill: {
            ...prev.drill,
            path: prev.drill.path.slice(0, index + 1),
          },
        }
      })
    },
    [setFilters],
  )

  const clearFilters = useCallback(() => {
    setFilters({ ...EMPTY_FILTER_CONTEXT })
  }, [setFilters])

  const copyViewLink = useCallback(async () => {
    const params = filtersToSearchParams(filters)
    const qs = params.toString()
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}${pathname}${qs ? `?${qs}` : ''}`
        : `${pathname}${qs ? `?${qs}` : ''}`
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
    }
    return url
  }, [filters, pathname])

  const value = useMemo<FilterProviderValue>(
    () => ({
      filters,
      meta,
      setFilters,
      setDimension,
      setComparison,
      setPeriodGrain,
      setCrossFilter: (arg) => setCrossFilter(arg),
      clearCrossFilter,
      drillInto,
      drillUpTo,
      clearFilters,
      copyViewLink,
    }),
    [
      filters,
      meta,
      setFilters,
      setDimension,
      setComparison,
      setPeriodGrain,
      setCrossFilter,
      clearCrossFilter,
      drillInto,
      drillUpTo,
      clearFilters,
      copyViewLink,
    ],
  )

  return (
    <FilterContextReact.Provider value={value}>{children}</FilterContextReact.Provider>
  )
}

export function useFilters(): FilterProviderValue {
  const ctx = useContext(FilterContextReact)
  if (!ctx) {
    throw new Error('useFilters must be used within FilterProvider')
  }
  return ctx
}

export function useFiltersOptional(): FilterProviderValue | null {
  return useContext(FilterContextReact)
}

export { isDefaultFilters }
