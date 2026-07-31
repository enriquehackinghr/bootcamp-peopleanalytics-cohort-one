'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { MetricChart } from '@/components/charts/MetricChart'
import { DetailTableView } from '@/components/shell/DetailTableView'
import type { CustomizedReportSpec } from '@/lib/types'

export function CustomizedReportDetailClient() {
  const params = useParams<{ reportId: string }>()
  const reportId = params.reportId
  const [report, setReport] = useState<CustomizedReportSpec | null>(null)
  const [dataVersionNote, setDataVersionNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}`)
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const json = (await res.json()) as {
          report: CustomizedReportSpec
          dataVersionChanged?: boolean
          currentDataLoadId?: string | null
        }
        if (!cancelled) {
          setReport(json.report)
          if (json.dataVersionChanged) {
            setDataVersionNote(
              `Data version changed since save (was ${json.report.data_load_id}, now ${json.currentDataLoadId}). Refresh to re-query latest measures.`,
            )
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load report')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [reportId])

  async function refresh() {
    const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refresh' }),
    })
    const json = (await res.json()) as { report?: CustomizedReportSpec; error?: string }
    if (json.report) {
      setReport(json.report)
      setDataVersionNote(null)
    } else {
      setError(json.error || 'Refresh failed')
    }
  }

  return (
    <>
      <header className="page-header">
        <p className="eyebrow">Customized report</p>
        <h1 className="page-title">{report?.title ?? 'Loading…'}</h1>
        <p className="lede">{report?.description}</p>
        <p>
          <Link href="/customized-reports">← All reports</Link>
          {' · '}
          <button type="button" className="text-button" onClick={() => void refresh()}>
            Refresh with latest data
          </button>
          {' · '}
          <a
            className="text-button"
            href={`/api/reports/${encodeURIComponent(reportId)}/export`}
          >
            Export JSON
          </a>
          {report?.lifecycle_state ? (
            <span className="admin-meta"> · state: {report.lifecycle_state}</span>
          ) : null}
        </p>
      </header>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {dataVersionNote ? <p className="aa-caveat">{dataVersionNote}</p> : null}
      <section className="chart-grid">
        {(report?.visuals ?? []).map((v) =>
          v.chart.points?.length ? (
            <MetricChart
              key={v.id}
              chart={{
                id: v.id,
                title: v.title,
                form: v.chart.form,
                dimension: v.chart.dimension,
                measure: v.chart.measure,
                points: v.chart.points,
                seriesKeys: v.chart.seriesKeys,
                referenceLines: v.chart.referenceLines,
                summary: v.chart.summary ?? '',
                methodologyId: v.chart.methodologyId,
              }}
            />
          ) : null,
        )}
        {report && !(report.visuals ?? []).some((v) => v.chart.points?.length) ? (
          <p className="aa-caveat">
            This report has no chart visuals yet. Ask the wizard to save a chart as a customized
            report, then confirm the save.
          </p>
        ) : null}
      </section>
      {(report?.tables ?? []).map((t) => (
        <DetailTableView key={t.id} table={t} />
      ))}
      {report?.methodology_links?.length ? (
        <p>
          Methodology:{' '}
          {report.methodology_links.map((id) => (
            <Link key={id} href={`/methodology#${id}`} className="methodology-link">
              {id}{' '}
            </Link>
          ))}
        </p>
      ) : null}
    </>
  )
}
