'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useMetricsCache } from '@/components/shell/MetricsCacheProvider'
import type { DataLoadRecord, IngestConfirmResult } from '@/lib/types'

type Phase =
  | { status: 'idle' }
  | { status: 'working'; fileNames: string[]; progress: number; label: string }
  | { status: 'success'; result: IngestConfirmResult; fileNames: string[] }
  | { status: 'error'; message: string; fileNames?: string[] }

const PROGRESS_STEPS = [
  { at: 12, label: 'Reading workbook…' },
  { at: 38, label: 'Detecting columns…' },
  { at: 62, label: 'Validating rows…' },
  { at: 82, label: 'Loading into Supabase…' },
] as const

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function summarizeRows(rowCounts: Record<string, number>): string {
  const parts = Object.entries(rowCounts).map(
    ([table, count]) => `${count.toLocaleString()} ${table}`,
  )
  return parts.length ? parts.join(' · ') : 'No rows'
}

export function AdminUploadClient() {
  const inputId = useId()
  const { invalidate } = useMetricsCache()
  const [phase, setPhase] = useState<Phase>({ status: 'idle' })
  const [dragging, setDragging] = useState(false)
  const [history, setHistory] = useState<DataLoadRecord[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  async function refreshHistory() {
    try {
      const res = await fetch('/api/ingest/loads')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load history')
      setHistory(data.loads as DataLoadRecord[])
      setHistoryError(null)
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : 'Could not load history',
      )
    }
  }

  useEffect(() => {
    void refreshHistory()
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current)
    }
  }, [])

  function clearProgressTimer() {
    if (progressTimer.current) {
      clearInterval(progressTimer.current)
      progressTimer.current = null
    }
  }

  function startProgress(fileNames: string[]) {
    clearProgressTimer()
    let step = 0
    setPhase({
      status: 'working',
      fileNames,
      progress: PROGRESS_STEPS[0].at,
      label: PROGRESS_STEPS[0].label,
    })
    progressTimer.current = setInterval(() => {
      step = Math.min(step + 1, PROGRESS_STEPS.length - 1)
      const current = PROGRESS_STEPS[step]
      setPhase((prev) =>
        prev.status === 'working'
          ? { ...prev, progress: current.at, label: current.label }
          : prev,
      )
      if (step >= PROGRESS_STEPS.length - 1 && progressTimer.current) {
        clearInterval(progressTimer.current)
        progressTimer.current = null
      }
    }, 700)
  }

  async function runAutoLoad(files: File[]) {
    if (!files.length) return
    const fileNames = files.map((f) => f.name)
    startProgress(fileNames)

    try {
      const form = new FormData()
      files.forEach((f) => form.append('files', f))
      form.set('confirm', 'true')
      form.set('overrides', '[]')

      const res = await fetch('/api/ingest/confirm', { method: 'POST', body: form })
      const data = await res.json()
      clearProgressTimer()

      if (!res.ok) {
        const details =
          data.details?.issues && Array.isArray(data.details.issues)
            ? data.details.issues
                .slice(0, 5)
                .map((i: { message?: string }) => i.message)
                .filter(Boolean)
                .join(' · ')
            : null
        throw new Error(details || data.error || 'Load failed')
      }

      setPhase({
        status: 'success',
        result: data as IngestConfirmResult,
        fileNames,
      })
      invalidate()
      void refreshHistory()
    } catch (error) {
      clearProgressTimer()
      setPhase({
        status: 'error',
        message: error instanceof Error ? error.message : 'Load failed',
        fileNames,
      })
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length) void runAutoLoad(files)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    const files = [...event.dataTransfer.files]
    if (files.length) void runAutoLoad(files)
  }

  const busy = phase.status === 'working'

  return (
    <div className="admin-page">
      <header className="admin-header">
        <p className="eyebrow">Admin</p>
        <h1>Data load</h1>
        <p className="lede">
          Drop a Meridian workbook. It validates and loads into Supabase
          automatically.
        </p>
      </header>

      <label
        htmlFor={inputId}
        className={`upload${dragging ? ' is-dragging' : ''}${phase.status === 'success' ? ' is-ready' : ''}`}
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
          disabled={busy}
          onChange={onInputChange}
        />
        <div className="upload-copy">
          <p className="upload-title">
            {phase.status === 'working'
              ? phase.fileNames.join(', ')
              : phase.status === 'success'
                ? phase.fileNames.join(', ')
                : 'Drop Meridian source files'}
          </p>
          <p className="upload-hint">
            {busy
              ? phase.label
              : '.csv / .xlsx / .xls · validate and load in one step'}
          </p>
        </div>
        <span className="upload-action">
          {busy ? 'Working…' : 'Choose files'}
        </span>
      </label>

      {phase.status === 'working' && (
        <section className="admin-section" aria-live="polite">
          <div className="admin-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase.progress}>
            <div className="admin-progress-bar" style={{ width: `${phase.progress}%` }} />
          </div>
          <p className="admin-meta">{phase.label}</p>
        </section>
      )}

      {phase.status === 'error' && (
        <p className="error" role="alert">
          {phase.message}
        </p>
      )}

      {phase.status === 'success' && (
        <section className="admin-section admin-success" role="status">
          <p className="admin-success-title">Load confirmed</p>
          <p>
            {summarizeRows(phase.result.promoted)} promoted into Supabase. The
            dashboard now reads this data.
          </p>
          <p className="admin-meta">
            {formatWhen(phase.result.load.loadedAt)} · id {phase.result.load.id}
          </p>
          <div className="admin-actions">
            <Link href="/overview" className="admin-actions-link">
              Go to dashboard
            </Link>
            <button
              type="button"
              onClick={() => setPhase({ status: 'idle' })}
            >
              Upload another file
            </button>
          </div>
        </section>
      )}

      <section className="admin-section">
        <h2>Load history</h2>
        {historyError && (
          <p className="error" role="alert">
            {historyError}
          </p>
        )}
        {!historyError && history.length === 0 && (
          <p className="admin-meta">No loads yet. Upload a workbook to start.</p>
        )}
        {history.length > 0 && (
          <ul className="admin-history">
            {history.map((load) => (
              <li key={load.id} className="admin-history-item">
                <div>
                  <p className="admin-card-title">
                    {load.fileNames.length
                      ? load.fileNames.join(', ')
                      : 'Untitled load'}
                  </p>
                  <p className="admin-meta">
                    {formatWhen(load.loadedAt)}
                    {load.loadedBy ? ` · ${load.loadedBy}` : ''}
                  </p>
                </div>
                <p className="admin-history-counts">
                  {summarizeRows(load.rowCounts)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
