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

      <section className="methodology-callout" id="limitations-a3">
        <h3>Prevented / Detected / Unresolved (A3 residual)</h3>
        <ul>
          <li>
            <strong>Prevented:</strong> permission matrix, scope checks, suppression
            threshold (n&lt;5), and the adversarial write guard block unauthorized disclosure
            and permission-layer edits from the improvement loop.
          </li>
          <li>
            <strong>Detected:</strong> adversarial suites log attack-class failures,
            injection fixtures, and detection-only controls; findings feed human-governed
            proposals.
          </li>
          <li>
            <strong>Unresolved:</strong> A3 aggregate differencing remains an accepted
            residual risk with a named owner and future mitigation — documented separately
            from prevented controls. Do not claim A3 is fully closed.
          </li>
        </ul>
      </section>

      <section className="methodology-callout" id="metric-result-status">
        <h3>MetricResultStatus</h3>
        <p>
          Metric APIs and the Wizard distinguish <code>value</code> (including genuine
          zero), <code>no_data</code>, <code>unavailable</code>, <code>suppressed</code>,
          and <code>error</code>. Narration must never substitute raw numeric zero for
          missing observations.
        </p>
      </section>

      <section className="methodology-callout" id="planning-formulas">
        <h3>Corrected planning formulas</h3>
        <p>
          <code>estimated_fy_base_salary_expense</code> = expense through the reporting
          boundary + forecast for the remaining period. Vacancy savings are a memo line
          only and are never subtracted (they were never in the filled run rate). Outputs
          are labelled estimated base-salary expense — not actual payroll spend. Budget
          variance = estimated − approved; positive means over budget. Reference
          informational annualized run rate $128,203,500; approved FY26 budget
          $151,110,763.
        </p>
      </section>

      <section className="methodology-callout" id="auth-password-dropped">
        <h3>Why password authentication was dropped</h3>
        <p>
          Password auth with Resend email verification was planned, then dropped because
          meridiananalytics.com does not exist — all 820 work emails are synthetic. Resend
          would return HTTP 200 while every message failed to deliver. Email-only session
          auth is the Class 5 simplification; enterprise identity + RLS belong in the
          30-day plan before a second real user.
        </p>
      </section>

      <section className="methodology-callout" id="responsible-use-signals">
        <h3>Responsible use — signals and risk</h3>
        <p>
          These indicators are directional, not predictive of any individual&apos;s
          decision. They are derived from patterns in historical data and should inform
          conversations, never employment decisions on their own. Engagement shift signals
          are observation-based (quarterly), never day-based.
        </p>
      </section>

      <section className="methodology-callout" id="wizard-adversarial">
        <h3>Wizard versioning and adversarial loop</h3>
        <p>
          Class 5 closes a two-LLM feedback loop: the Wizard (OpenAI) is probed by a
          separate adversarial model (Anthropic). Failures become structured findings and
          human-governed improvement proposals against versioned Wizard artifacts only —
          never the permission layer. Live suite size targets 36–48 cases across attack
          classes A1–A13.
        </p>
      </section>

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
