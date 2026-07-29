'use client'

import type { DataFreshness, DataSourceRef } from '@/lib/types'

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function formatSourceLine(
  freshness: DataFreshness | null | undefined,
  tables?: string[],
): string | null {
  if (!freshness) return null

  let sources: DataSourceRef[] = freshness.sources ?? []
  if (tables?.length) {
    const wanted = new Set(tables)
    sources = sources.filter((s) => s.tables.some((t) => wanted.has(t)))
  }

  if (!sources.length && freshness.sourceSummary && freshness.lastLoadedAt) {
    return `Source: ${freshness.sourceSummary} (last uploaded: ${formatWhen(freshness.lastLoadedAt)})`
  }
  if (!sources.length) return null

  return `Source: ${sources
    .map((s) => `${s.fileName} (last uploaded: ${formatWhen(s.loadedAt)})`)
    .join(' · ')}`
}

export function SourceLine({
  freshness,
  tables,
  className = 'source-line',
}: {
  freshness: DataFreshness | null | undefined
  tables?: string[]
  className?: string
}) {
  const text = formatSourceLine(freshness, tables)
  if (!text) return null
  return <p className={className}>{text}</p>
}
