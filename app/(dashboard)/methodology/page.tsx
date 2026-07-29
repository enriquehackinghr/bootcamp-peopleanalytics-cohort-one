'use client'

import { useEffect, useState } from 'react'
import type { MethodologyEntry, MethodologyResponse } from '@/lib/types'

export default function MethodologyPage() {
  const [data, setData] = useState<MethodologyResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/methodology')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load methodology')
        if (!cancelled) setData(json as MethodologyResponse)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load methodology')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!data) return
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
    if (!hash) return
    const el = document.getElementById(hash)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [data])

  const entries: MethodologyEntry[] = data?.entries ?? []

  return (
    <div className="methodology-page">
      <header className="methodology-header">
        <h2 className="card-title">Methodology</h2>
        <p className="card-subtitle">
          Every Section 5 definition, its source tables, and responsible-use
          language. Deep-linked from KPI tiles and charts (MET-1).
        </p>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!data && !error && <p className="admin-meta">Loading definitions…</p>}

      {data?.engagementInstrumentNotes?.length ? (
        <section className="methodology-callout">
          <h3>Engagement instruments</h3>
          <ul>
            {data.engagementInstrumentNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {data?.mappingCaveats?.length ? (
        <section className="methodology-callout">
          <h3>Mapping caveats</h3>
          <ul>
            {data.mappingCaveats.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="methodology-list">
        {entries.map((entry) => (
          <article key={entry.id} id={entry.id} className="methodology-entry card">
            <h3 className="card-title">{entry.name}</h3>
            <p className="card-subtitle">{entry.definition}</p>
            <p className="admin-meta">
              Sources: {entry.sourceTables.join(', ') || '—'}
            </p>
            {entry.notes ? <p className="admin-meta">{entry.notes}</p> : null}
            {entry.reconciliationTarget ? (
              <p className="admin-meta">
                Reconciliation target: {entry.reconciliationTarget}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  )
}
