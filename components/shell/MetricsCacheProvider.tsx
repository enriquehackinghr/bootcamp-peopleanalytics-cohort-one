'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useFiltersOptional } from '@/components/shell/FilterProvider'
import {
  EMPTY_FILTER_CONTEXT,
  type DataFreshness,
  type FilterContext,
  type PageVisualBundle,
} from '@/lib/types'

type CacheEntry = {
  bundle: PageVisualBundle
  loadKey: string
}

type MetricsCacheValue = {
  freshness: DataFreshness | null
  ensureFreshness: () => Promise<DataFreshness>
  peekBundle: (endpoint: string, filters?: FilterContext) => PageVisualBundle | null
  getBundle: (
    endpoint: string,
    filters?: FilterContext,
  ) => Promise<{ bundle: PageVisualBundle; fromCache: boolean }>
  invalidate: () => void
}

const MetricsCacheContext = createContext<MetricsCacheValue | null>(null)

const store = {
  freshness: null as DataFreshness | null,
  bundles: new Map<string, CacheEntry>(),
  inflight: new Map<string, Promise<PageVisualBundle>>(),
  freshnessInflight: null as Promise<DataFreshness> | null,
  listeners: new Set<() => void>(),
}

function emit() {
  for (const listener of store.listeners) listener()
}

function subscribe(listener: () => void) {
  store.listeners.add(listener)
  return () => {
    store.listeners.delete(listener)
  }
}

function getFreshnessSnapshot() {
  return store.freshness
}

function filterKey(filters: FilterContext): string {
  return JSON.stringify(filters)
}

function cacheKey(endpoint: string, filters: FilterContext, freshness: DataFreshness | null) {
  return `${endpoint}::${freshness?.lastLoadedAt ?? 'no-load'}::${filterKey(filters)}`
}

function peekBundle(
  endpoint: string,
  filters: FilterContext = EMPTY_FILTER_CONTEXT,
): PageVisualBundle | null {
  const key = cacheKey(endpoint, filters, store.freshness)
  return store.bundles.get(key)?.bundle ?? null
}

async function ensureFreshness(): Promise<DataFreshness> {
  if (store.freshness) return store.freshness
  if (store.freshnessInflight) return store.freshnessInflight

  store.freshnessInflight = (async () => {
    const res = await fetch('/api/filters/meta')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not read data freshness')
    store.freshness = data.freshness as DataFreshness
    emit()
    return store.freshness
  })()

  try {
    return await store.freshnessInflight
  } finally {
    store.freshnessInflight = null
  }
}

async function getBundle(
  endpoint: string,
  filters: FilterContext = EMPTY_FILTER_CONTEXT,
): Promise<{ bundle: PageVisualBundle; fromCache: boolean }> {
  const currentFreshness = await ensureFreshness()
  const key = cacheKey(endpoint, filters, currentFreshness)
  const cached = store.bundles.get(key)
  if (cached) {
    return { bundle: cached.bundle, fromCache: true }
  }

  const existing = store.inflight.get(key)
  if (existing) {
    const bundle = await existing
    return { bundle, fromCache: false }
  }

  const request = (async () => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load metrics')
    const bundle = data as PageVisualBundle
    if (bundle.freshness?.lastLoadedAt) {
      store.freshness = bundle.freshness
    }
    store.bundles.set(key, {
      bundle,
      loadKey: key,
    })
    emit()
    return bundle
  })()

  store.inflight.set(key, request)
  try {
    const bundle = await request
    return { bundle, fromCache: false }
  } finally {
    store.inflight.delete(key)
  }
}

function invalidate() {
  store.bundles.clear()
  store.inflight.clear()
  store.freshnessInflight = null
  store.freshness = null
  emit()
}

export function MetricsCacheProvider({ children }: { children: ReactNode }) {
  const freshness = useSyncExternalStore(
    subscribe,
    getFreshnessSnapshot,
    () => null,
  )

  const value = useMemo<MetricsCacheValue>(
    () => ({
      freshness,
      ensureFreshness,
      peekBundle,
      getBundle,
      invalidate,
    }),
    [freshness],
  )

  return (
    <MetricsCacheContext.Provider value={value}>{children}</MetricsCacheContext.Provider>
  )
}

export function useMetricsCache(): MetricsCacheValue {
  const ctx = useContext(MetricsCacheContext)
  if (!ctx) {
    throw new Error('useMetricsCache must be used within MetricsCacheProvider')
  }
  return ctx
}

/** Direct peek for initial render without waiting on effects. */
export function peekCachedBundle(
  endpoint: string,
  filters?: FilterContext,
): PageVisualBundle | null {
  const live = typeof window !== 'undefined' ? filters : undefined
  return peekBundle(endpoint, live ?? EMPTY_FILTER_CONTEXT)
}

/** Hook helper: peek using current filter context when available. */
export function usePeekCachedBundle(endpoint: string): PageVisualBundle | null {
  const filters = useFiltersOptional()?.filters
  return peekBundle(endpoint, filters ?? EMPTY_FILTER_CONTEXT)
}
