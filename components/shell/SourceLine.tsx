'use client'

import type { DataFreshness, DataSourceRef } from '@/lib/types'

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function resolveSources(
  freshness: DataFreshness,
  tables?: string[],
): DataSourceRef[] {
  let sources: DataSourceRef[] = freshness.sources ?? []
  if (tables?.length) {
    const wanted = new Set(tables)
    sources = sources.filter((s) => s.tables.some((t) => wanted.has(t)))
  }
  return sources
}

/** Plain-text fallback for exports / tooltips. Prefer <SourceLine /> in UI. */
export function formatSourceLine(
  freshness: DataFreshness | null | undefined,
  tables?: string[],
): string | null {
  if (!freshness) return null
  const sources = resolveSources(freshness, tables)
  if (!sources.length && freshness.sourceSummary && freshness.lastLoadedAt) {
    return `Source: ${freshness.sourceSummary} (last uploaded: ${formatWhen(freshness.lastLoadedAt)})`
  }
  if (!sources.length) return null
  const latest = sources[0]?.loadedAt
  const count = sources.length
  return `Source: ${count} file${count === 1 ? '' : 's'}${latest ? ` · updated ${formatWhen(latest)}` : ''}`
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
  if (!freshness) return null

  const sources = resolveSources(freshness, tables)
  const fallbackNames =
    !sources.length && freshness.sourceSummary
      ? freshness.sourceSummary
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((fileName) => ({
            fileName,
            loadedAt: freshness.lastLoadedAt ?? '',
            tables: [] as string[],
          }))
      : []

  const rows = sources.length ? sources : fallbackNames
  if (!rows.length) return null

  const latest = rows[0]?.loadedAt || freshness.lastLoadedAt
  const count = rows.length
  const compact = `${count} source file${count === 1 ? '' : 's'}${
    latest ? ` · ${formatWhen(latest)}` : ''
  }`

  return (
    <details className={`${className} source-line-details`}>
      <summary className="source-line-summary">
        <span className="source-line-label">Source</span>
        <span className="source-line-compact">{compact}</span>
        <span className="source-line-caret" aria-hidden="true">
          ▾
        </span>
      </summary>
      <ul className="source-line-list">
        {rows.map((s) => (
          <li key={`${s.fileName}-${s.loadedAt}`}>
            <span className="source-line-name" title={s.fileName}>
              {s.fileName}
            </span>
            {s.loadedAt ? (
              <span className="source-line-when">{formatWhen(s.loadedAt)}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  )
}
