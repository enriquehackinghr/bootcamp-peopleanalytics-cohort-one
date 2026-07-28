'use client'

import { useId, useState, type ChangeEvent, type DragEvent } from 'react'
import type {
  DatasetPreview,
  IngestConfirmResult,
  TargetTable,
  ValidationReport,
} from '@/lib/types'

const TARGET_OPTIONS: TargetTable[] = [
  'employees',
  'compensation_events',
  'performance_reviews',
  'competency_scores',
  'engagement_responses',
  'engagement_questions',
  'engagement_open_ended',
  'requisitions',
  'funnel_events',
  'offers',
  'application_sources',
  'recruiters',
  'market_benchmarks',
  'competency_framework',
]

type Phase =
  | { status: 'idle' }
  | { status: 'preview'; files: File[]; previews: DatasetPreview[] }
  | {
      status: 'validated'
      files: File[]
      previews: DatasetPreview[]
      validation: ValidationReport
    }
  | { status: 'loaded'; result: IngestConfirmResult }
  | { status: 'error'; message: string }

export function AdminUploadClient() {
  const inputId = useId()
  const [phase, setPhase] = useState<Phase>({ status: 'idle' })
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [overrides, setOverrides] = useState<
    Record<string, { datasetKey: TargetTable; headerRowIndex: number }>
  >({})

  async function runPreview(files: File[]) {
    setBusy(true)
    try {
      const form = new FormData()
      files.forEach((f) => form.append('files', f))
      const res = await fetch('/api/ingest/preview', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Preview failed')

      const previews = data.previews as DatasetPreview[]
      const nextOverrides: typeof overrides = {}
      for (const p of previews) {
        if (p.datasetKey !== 'unknown') {
          nextOverrides[p.sourceLabel] = {
            datasetKey: p.datasetKey,
            headerRowIndex: p.headerRowIndex,
          }
        }
      }
      setOverrides(nextOverrides)
      setPhase({ status: 'preview', files, previews })
    } catch (error) {
      setPhase({
        status: 'error',
        message: error instanceof Error ? error.message : 'Preview failed',
      })
    } finally {
      setBusy(false)
    }
  }

  async function runValidate() {
    if (phase.status !== 'preview' && phase.status !== 'validated') return
    setBusy(true)
    try {
      const form = new FormData()
      phase.files.forEach((f) => form.append('files', f))
      form.set('confirm', 'false')
      form.set(
        'overrides',
        JSON.stringify(
          Object.entries(overrides).map(([sourceLabel, value]) => ({
            sourceLabel,
            ...value,
          })),
        ),
      )
      const res = await fetch('/api/ingest/confirm', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Validation failed')
      setPhase({
        status: 'validated',
        files: phase.files,
        previews: phase.previews,
        validation: data.validation as ValidationReport,
      })
    } catch (error) {
      setPhase({
        status: 'error',
        message: error instanceof Error ? error.message : 'Validation failed',
      })
    } finally {
      setBusy(false)
    }
  }

  async function runPromote() {
    if (phase.status !== 'validated') return
    setBusy(true)
    try {
      const form = new FormData()
      phase.files.forEach((f) => form.append('files', f))
      form.set('confirm', 'true')
      form.set(
        'overrides',
        JSON.stringify(
          Object.entries(overrides).map(([sourceLabel, value]) => ({
            sourceLabel,
            ...value,
          })),
        ),
      )
      const res = await fetch('/api/ingest/confirm', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Load failed')
      setPhase({ status: 'loaded', result: data as IngestConfirmResult })
    } catch (error) {
      setPhase({
        status: 'error',
        message: error instanceof Error ? error.message : 'Load failed',
      })
    } finally {
      setBusy(false)
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length) void runPreview(files)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    const files = [...event.dataTransfer.files]
    if (files.length) void runPreview(files)
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <p className="eyebrow">Admin</p>
        <h1>Data load</h1>
        <p className="lede">
          Upload Meridian source workbooks. Preview header detection and column
          mapping, validate, then confirm to promote into Supabase. No auth gate
          in v0.1.
        </p>
      </header>

      <label
        htmlFor={inputId}
        className={`upload${dragging ? ' is-dragging' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          id={inputId}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls"
          hidden
          onChange={onInputChange}
        />
        <div className="upload-copy">
          <p className="upload-title">Drop Meridian source files</p>
          <p className="upload-hint">.csv / .xlsx / .xls · multiple files OK</p>
        </div>
        <span className="upload-action">{busy ? 'Working…' : 'Choose files'}</span>
      </label>

      {phase.status === 'error' && (
        <p className="error" role="alert">
          {phase.message}
        </p>
      )}

      {(phase.status === 'preview' || phase.status === 'validated') && (
        <section className="admin-section">
          <h2>Detected datasets</h2>
          {phase.previews.map((preview) => (
            <article key={preview.sourceLabel} className="admin-card">
              <p className="admin-card-title">{preview.sourceLabel}</p>
              <p className="admin-meta">
                Header row {preview.headerRowIndex + 1} · {preview.rowCount} data
                rows
              </p>
              <label className="admin-field">
                Target table
                <select
                  value={
                    overrides[preview.sourceLabel]?.datasetKey ??
                    (preview.datasetKey === 'unknown'
                      ? 'employees'
                      : preview.datasetKey)
                  }
                  onChange={(e) =>
                    setOverrides((prev) => ({
                      ...prev,
                      [preview.sourceLabel]: {
                        datasetKey: e.target.value as TargetTable,
                        headerRowIndex:
                          prev[preview.sourceLabel]?.headerRowIndex ??
                          preview.headerRowIndex,
                      },
                    }))
                  }
                >
                  {TARGET_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                Header row index (0-based)
                <input
                  type="number"
                  min={0}
                  value={
                    overrides[preview.sourceLabel]?.headerRowIndex ??
                    preview.headerRowIndex
                  }
                  onChange={(e) =>
                    setOverrides((prev) => ({
                      ...prev,
                      [preview.sourceLabel]: {
                        datasetKey:
                          prev[preview.sourceLabel]?.datasetKey ??
                          (preview.datasetKey === 'unknown'
                            ? 'employees'
                            : preview.datasetKey),
                        headerRowIndex: Number(e.target.value),
                      },
                    }))
                  }
                />
              </label>
              {preview.missingRequiredTargets.length > 0 && (
                <p className="error">
                  Missing required: {preview.missingRequiredTargets.join(', ')}
                </p>
              )}
              <details>
                <summary>Column mapping</summary>
                <ul>
                  {preview.mappings.map((m) => (
                    <li key={m.targetColumn}>
                      <code>{m.sourceColumn ?? '—'}</code> →{' '}
                      <code>{m.targetColumn}</code>
                      {m.required ? ' *' : ''}
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          ))}

          <div className="admin-actions">
            <button type="button" disabled={busy} onClick={() => void runValidate()}>
              Validate
            </button>
            {phase.status === 'validated' && phase.validation.ok && (
              <button type="button" disabled={busy} onClick={() => void runPromote()}>
                Confirm load
              </button>
            )}
          </div>
        </section>
      )}

      {phase.status === 'validated' && (
        <section className="admin-section">
          <h2>Validation</h2>
          <p>
            {phase.validation.ok
              ? 'All checks passed. Confirm to promote (all-or-nothing).'
              : 'Validation failed — nothing will load until errors are fixed.'}
          </p>
          <ul>
            {phase.validation.issues.map((issue, i) => (
              <li key={`${issue.datasetKey}-${i}`}>
                [{issue.severity}] {issue.datasetKey}
                {issue.rowNumber != null ? ` row ${issue.rowNumber}` : ''}:{' '}
                {issue.message}
              </li>
            ))}
          </ul>
          <pre>{JSON.stringify(phase.validation.rowCounts, null, 2)}</pre>
        </section>
      )}

      {phase.status === 'loaded' && (
        <section className="admin-section">
          <h2>Load complete</h2>
          <p>
            Load {phase.result.load.id} at {phase.result.load.loadedAt}
          </p>
          <pre>{JSON.stringify(phase.result.promoted, null, 2)}</pre>
        </section>
      )}
    </div>
  )
}
