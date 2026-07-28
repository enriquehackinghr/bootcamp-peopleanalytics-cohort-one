'use client'

import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  computeWorkforceMetrics,
  isAcceptedEmployeeFile,
  parseEmployeeFile,
  type WorkforceMetrics,
} from '@/lib/metrics'

type UploadState =
  | { status: 'idle' }
  | { status: 'ready'; fileName: string; rowCount: number; metrics: WorkforceMetrics }
  | { status: 'error'; message: string }

function formatRate(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatSpan(value: number): string {
  return value === 0 ? '—' : value.toFixed(1)
}

export function Dashboard() {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [upload, setUpload] = useState<UploadState>({ status: 'idle' })
  const [dragging, setDragging] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!isAcceptedEmployeeFile(file.name)) {
      setUpload({
        status: 'error',
        message: 'Please upload a .csv, .xlsx, or .xls file.',
      })
      return
    }

    try {
      const employees = await parseEmployeeFile(file)
      const metrics = computeWorkforceMetrics(employees)
      setUpload({
        status: 'ready',
        fileName: file.name,
        rowCount: employees.length,
        metrics,
      })
    } catch (error) {
      setUpload({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not read that employee master file.',
      })
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0])
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    void handleFile(event.dataTransfer.files?.[0])
  }

  const metrics = upload.status === 'ready' ? upload.metrics : null

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden="true" />

      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p className="brand-name">Meridian Analytics</p>
            <p className="brand-sub">People Intelligence</p>
          </div>
        </div>
        <p className="topbar-note">Workforce snapshot</p>
      </header>

      <main className="shell">
        <section className="hero">
          <p className="eyebrow">People analytics</p>
          <h1 className="brand-hero">Meridian Analytics</h1>
          <p className="headline">
            Headcount, turnover, and span of control from your employee master
            file.
          </p>
          <p className="lede">
            Upload a CSV or Excel file to calculate the core workforce metrics
            for this snapshot.
          </p>
        </section>

        <section className="workspace">
          <label
            htmlFor={inputId}
            className={`upload${dragging ? ' is-dragging' : ''}${upload.status === 'ready' ? ' is-ready' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              id={inputId}
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onInputChange}
              hidden
            />
            <div className="upload-copy">
              <p className="upload-title">
                {upload.status === 'ready'
                  ? upload.fileName
                  : 'Upload employee master file'}
              </p>
              <p className="upload-hint">
                {upload.status === 'ready'
                  ? `${upload.rowCount} rows parsed · click or drop to replace`
                  : 'Drag and drop, or click to browse · .csv, .xlsx, .xls'}
              </p>
            </div>
            <span className="upload-action">
              {upload.status === 'ready' ? 'Replace file' : 'Choose file'}
            </span>
          </label>

          {upload.status === 'error' && (
            <p className="error" role="alert">
              {upload.message}
            </p>
          )}

          <p className="schema">
            Required columns: <code>employee_id</code>,{' '}
            <code>manager_id</code>/<code>manager_employee_id</code>,{' '}
            <code>status</code>/<code>employment_status</code> (active /
            terminated). Optional: <code>full_name</code> or{' '}
            <code>first_name</code> + <code>last_name</code>,{' '}
            <code>hire_date</code>, <code>termination_date</code>,{' '}
            <code>department</code>.{' '}
            <a href="/sample-employee-master.csv" download>
              Download sample CSV
            </a>
            {' · '}
            <a href="/admin/upload">Admin multi-file load</a>
          </p>
        </section>

        <section className="metrics" aria-live="polite">
          <article className="metric metric-a">
            <p className="metric-label">Total employees</p>
            <p className="metric-value">
              {metrics ? metrics.totalEmployees.toLocaleString() : '—'}
            </p>
            <p className="metric-note">Active headcount</p>
          </article>

          <article className="metric metric-b">
            <p className="metric-label">Turnover rate</p>
            <p className="metric-value">
              {metrics ? formatRate(metrics.turnoverRate) : '—'}
            </p>
            <p className="metric-note">
              {metrics
                ? `${metrics.terminatedCount} separated ÷ ${metrics.totalEmployees + metrics.terminatedCount} in file`
                : 'Separated ÷ total in file'}
            </p>
          </article>

          <article className="metric metric-c">
            <p className="metric-label">Span of control</p>
            <p className="metric-value">
              {metrics ? formatSpan(metrics.spanOfControl) : '—'}
            </p>
            <p className="metric-note">
              {metrics
                ? `Avg direct reports across ${metrics.managerCount} managers`
                : 'Avg direct reports per manager'}
            </p>
          </article>
        </section>
      </main>
    </div>
  )
}
