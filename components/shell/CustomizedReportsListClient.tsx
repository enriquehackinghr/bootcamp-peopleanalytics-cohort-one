'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { CustomizedReportSpec } from '@/lib/types'

export function CustomizedReportsListClient() {
  const [reports, setReports] = useState<CustomizedReportSpec[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/reports')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { reports: CustomizedReportSpec[] }
        if (!cancelled) setReports(json.reports ?? [])
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load reports')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <header className="page-header">
        <p className="eyebrow">Persistent reports</p>
        <h1 className="page-title">Customized Reports</h1>
        <p className="lede">
          Definitions re-query approved semantic measures on open. Create and
          edit through the Wizard — never a route around suppression.
        </p>
      </header>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="reports-list">
        {reports.length === 0 ? (
          <article className="card">
            <p className="card-subtitle">
              No saved reports yet. Ask the Wizard to create a chart, then save
              it as a customized report.
            </p>
          </article>
        ) : (
          reports.map((r) => (
            <article key={r.id} className="card report-card">
              <h3 className="card-title">
                <Link href={`/customized-reports/${r.id}`}>{r.title}</Link>
              </h3>
              <p className="card-subtitle">{r.description}</p>
              <p>
                {r.created_via_wizard ? 'Created via Wizard · ' : ''}
                {r.report_type} · {new Date(r.created_at).toLocaleDateString()} ·
                owner {r.created_by}
              </p>
              <p className="aa-caveat">
                Data load {r.data_load_id ?? '—'} · semantic {r.semantic_model_version}
              </p>
            </article>
          ))
        )}
      </div>
    </>
  )
}
