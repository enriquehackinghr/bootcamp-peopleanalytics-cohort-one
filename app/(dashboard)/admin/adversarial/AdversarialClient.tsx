'use client'

import { useEffect, useMemo, useState } from 'react'
import type {
  AdversarialProbeResult,
  AdversarialRun,
  AdversarialRunDetail,
} from '@/lib/adversarial/types'
import { DIMENSION_LABELS } from '@/lib/adversarial/scoring'

type RunPhase =
  | { status: 'idle' }
  | {
      status: 'running'
      runId: string
      totalProbes: number
      completedProbes: number
      latestProbeKey: string | null
    }
  | { status: 'error'; message: string }

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function gradeColor(grade: string | null | undefined): string {
  switch (grade) {
    case 'A':
      return '#16a34a'
    case 'B':
      return '#65a30d'
    case 'C':
      return '#ca8a04'
    case 'D':
      return '#ea580c'
    case 'F':
      return '#dc2626'
    default:
      return '#6b7280'
  }
}

function severityColor(sev: string): string {
  switch (sev) {
    case 'critical':
      return '#dc2626'
    case 'warning':
      return '#ca8a04'
    default:
      return '#0ea5e9'
  }
}

const SPIN_STYLE = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`

export function AdversarialClient() {
  const [phase, setPhase] = useState<RunPhase>({ status: 'idle' })
  const [runs, setRuns] = useState<AdversarialRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AdversarialRunDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  async function refreshRuns() {
    try {
      const res = await fetch('/api/adversarial/runs')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load runs')
      setRuns(data.runs as AdversarialRun[])
      setListError(null)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load runs')
    }
  }

  async function loadDetail(runId: string) {
    setSelectedRunId(runId)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/adversarial/runs/${runId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load run detail')
      setDetail(data as AdversarialRunDetail)
    } catch (err) {
      setDetail(null)
      setListError(err instanceof Error ? err.message : 'Could not load run detail')
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    void refreshRuns()
  }, [])

  async function triggerRun() {
    try {
      const res = await fetch('/api/adversarial/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggeredBy: 'manual' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Adversarial run failed')

      const runId: string = data.runId
      const totalProbes: number = data.totalProbes ?? 0

      if (data.status === 'completed' || totalProbes === 0) {
        setPhase({ status: 'idle' })
        await refreshRuns()
        if (runId) await loadDetail(runId)
        return
      }

      setPhase({
        status: 'running',
        runId,
        totalProbes,
        completedProbes: 0,
        latestProbeKey: null,
      })
      await pollUntilDone(runId, totalProbes)
    } catch (err) {
      setPhase({
        status: 'error',
        message: err instanceof Error ? err.message : 'Run failed',
      })
    }
  }

  async function pollUntilDone(runId: string, totalProbes: number) {
    const pollMs = 2000
    const maxMs = 20 * 60 * 1000
    const startedAt = Date.now()
    while (Date.now() - startedAt < maxMs) {
      try {
        const res = await fetch(`/api/adversarial/runs/${runId}`)
        const detailData = (await res.json()) as AdversarialRunDetail
        if (!res.ok) throw new Error('Progress lookup failed')

        const done = detailData.reports_audited ?? 0
        const latest =
          detailData.probes.length > 0
            ? detailData.probes[detailData.probes.length - 1].probe_key
            : null

        setPhase({
          status: 'running',
          runId,
          totalProbes,
          completedProbes: done,
          latestProbeKey: latest,
        })

        if (detailData.status === 'completed' || detailData.status === 'failed') {
          setPhase({ status: 'idle' })
          setDetail(detailData)
          setSelectedRunId(runId)
          await refreshRuns()
          return
        }
      } catch (err) {
        setPhase({
          status: 'error',
          message: err instanceof Error ? err.message : 'Progress lookup failed',
        })
        return
      }
      await new Promise((r) => setTimeout(r, pollMs))
    }
    setPhase({
      status: 'error',
      message: 'Timed out waiting for adversarial run to finish.',
    })
  }

  const latest = runs[0]
  const runningNow = phase.status === 'running'

  const dimensionAverages = useMemo(() => {
    if (!detail || detail.probes.length === 0) return null
    const dims = [
      'factual_grounding',
      'methodology_soundness',
      'bias_fairness',
      'hallucination',
      'actionability',
    ] as const
    const out: Record<string, number> = {}
    for (const key of dims) {
      const sum = detail.probes.reduce((acc, p) => acc + p.scores[key], 0)
      out[key] = Math.round((sum / detail.probes.length) * 10) / 10
    }
    return out
  }, [detail])

  const severityCounts = useMemo(() => {
    if (!detail) return { critical: 0, warning: 0, info: 0 }
    const c = { critical: 0, warning: 0, info: 0 }
    for (const p of detail.probes) c[p.severity] += 1
    return c
  }, [detail])

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <style dangerouslySetInnerHTML={{ __html: SPIN_STYLE }} />
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
            Adversarial AI Auditor
          </h1>
          <p style={{ margin: '0.5rem 0 0', maxWidth: 780, color: 'var(--text-2, #4b5563)' }}>
            Claude sends a curated bank of adversarial questions to the OpenAI-powered wizard
            and scores the wizard&apos;s live responses on factual grounding, methodology
            soundness, bias &amp; fairness, hallucination, and actionability. Runs weekly by
            cron; admins can trigger a run manually below.
          </p>
        </div>
        <button
          type="button"
          onClick={triggerRun}
          disabled={runningNow}
          style={{
            padding: '0.6rem 1rem',
            borderRadius: 8,
            border: '1px solid var(--border, #d1d5db)',
            background: runningNow ? '#e5e7eb' : '#111827',
            color: runningNow ? '#374151' : '#fff',
            cursor: runningNow ? 'wait' : 'pointer',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          {runningNow ? 'Probing wizard…' : 'Run audit now'}
        </button>
      </header>

      {phase.status === 'running' && (
        <ProgressPanel
          completed={phase.completedProbes}
          total={phase.totalProbes}
          latestProbeKey={phase.latestProbeKey}
        />
      )}

      {phase.status === 'error' && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: 8 }}>
          {phase.message}
        </div>
      )}

      {listError && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', padding: '0.75rem 1rem', borderRadius: 8 }}>
          {listError}
        </div>
      )}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <SummaryTile label="Latest wizard grade">
          <span
            style={{
              fontSize: '2.5rem',
              fontWeight: 700,
              color: gradeColor(latest?.letter_grade),
            }}
          >
            {latest?.letter_grade ?? '—'}
          </span>
          <span style={{ color: 'var(--text-2, #6b7280)', fontSize: '.85rem' }}>
            {latest?.composite_score != null ? `${latest.composite_score}/100` : ''}
          </span>
        </SummaryTile>
        <SummaryTile label="Probes in last run">
          <span style={{ fontSize: '2rem', fontWeight: 600 }}>
            {latest?.reports_audited ?? 0}
          </span>
        </SummaryTile>
        <SummaryTile label="Last run">
          <span style={{ fontSize: '.95rem', fontWeight: 500 }}>
            {formatWhen(latest?.started_at ?? null)}
          </span>
          <span style={{ color: 'var(--text-2, #6b7280)', fontSize: '.85rem' }}>
            via {latest?.triggered_by ?? '—'}
          </span>
        </SummaryTile>
        <SummaryTile label="Total runs">
          <span style={{ fontSize: '2rem', fontWeight: 600 }}>{runs.length}</span>
        </SummaryTile>
      </section>

      <section>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 600 }}>Run history</h2>
        {runs.length === 0 ? (
          <p style={{ color: 'var(--text-2, #6b7280)' }}>No runs yet. Trigger one above.</p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                  <th style={cellStyle}>Started</th>
                  <th style={cellStyle}>Trigger</th>
                  <th style={cellStyle}>Probes</th>
                  <th style={cellStyle}>Composite</th>
                  <th style={cellStyle}>Grade</th>
                  <th style={cellStyle}>Status</th>
                  <th style={cellStyle}>Summary</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const isActive = run.run_id === selectedRunId
                  return (
                    <tr
                      key={run.run_id}
                      onClick={() => loadDetail(run.run_id)}
                      style={{
                        cursor: 'pointer',
                        background: isActive ? '#eef2ff' : 'transparent',
                        borderTop: '1px solid var(--border, #e5e7eb)',
                      }}
                    >
                      <td style={cellStyle}>{formatWhen(run.started_at)}</td>
                      <td style={cellStyle}>{run.triggered_by}</td>
                      <td style={cellStyle}>{run.reports_audited}</td>
                      <td style={cellStyle}>
                        {run.composite_score != null ? `${run.composite_score}` : '—'}
                      </td>
                      <td style={cellStyle}>
                        <strong style={{ color: gradeColor(run.letter_grade) }}>
                          {run.letter_grade ?? '—'}
                        </strong>
                      </td>
                      <td style={cellStyle}>{run.status}</td>
                      <td style={{ ...cellStyle, maxWidth: 380, color: 'var(--text-2, #4b5563)' }}>
                        {run.summary ?? run.error ?? ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedRunId && (
        <section style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '1rem' }}>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 600 }}>
            Run detail
          </h2>
          {detailLoading || !detail ? (
            <p style={{ color: 'var(--text-2, #6b7280)' }}>Loading…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem' }}>
                {dimensionAverages &&
                  Object.entries(DIMENSION_LABELS).map(([key, label]) => (
                    <div
                      key={key}
                      style={{
                        padding: '.75rem',
                        border: '1px solid var(--border, #e5e7eb)',
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ fontSize: '.75rem', color: 'var(--text-2, #6b7280)', textTransform: 'uppercase' }}>{label}</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>
                        {dimensionAverages[key]?.toFixed(1)}<span style={{ color: 'var(--text-2, #6b7280)', fontSize: '.85rem' }}> / 5</span>
                      </div>
                    </div>
                  ))}
              </div>

              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                <SeverityChip label="Critical" count={severityCounts.critical} color="#dc2626" />
                <SeverityChip label="Warning" count={severityCounts.warning} color="#ca8a04" />
                <SeverityChip label="Info" count={severityCounts.info} color="#0ea5e9" />
              </div>

              <div>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600 }}>Probes</h3>
                {detail.probes.length === 0 ? (
                  <p style={{ color: 'var(--text-2, #6b7280)' }}>No probes were executed in this run.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                    {detail.probes.map((p) => (
                      <ProbeCard key={p.probe_result_id} probe={p} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function SummaryTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '.9rem 1rem',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: '.25rem',
      }}
    >
      <div style={{ fontSize: '.75rem', color: 'var(--text-2, #6b7280)', textTransform: 'uppercase' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function SeverityChip({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div
      style={{
        padding: '.35rem .75rem',
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        fontSize: '.8rem',
        fontWeight: 600,
      }}
    >
      {label}: {count}
    </div>
  )
}

function ProbeCard({ probe }: { probe: AdversarialProbeResult }) {
  const [expanded, setExpanded] = useState(false)
  const answer = probe.wizard_answer ?? ''
  const truncated = !expanded && answer.length > 400
  return (
    <div style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '.9rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '.7rem', color: 'var(--text-2, #6b7280)', textTransform: 'uppercase', letterSpacing: '.02em' }}>
            Probes {DIMENSION_LABELS[probe.probe_category]}
          </div>
          <div style={{ fontWeight: 600, marginTop: 2 }}>{probe.probe_question}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, color: gradeColor(probe.probe_grade), fontSize: '1.2rem' }}>
            {probe.probe_grade} · {probe.probe_composite}/100
          </div>
          <div style={{ fontSize: '.75rem', color: severityColor(probe.severity), textTransform: 'uppercase', fontWeight: 600 }}>
            {probe.severity}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '.5rem', fontSize: '.8rem', color: 'var(--text-2, #6b7280)' }}>
        <strong>Expected:</strong> {probe.expected_behavior}
      </div>

      <div style={{ marginTop: '.5rem', padding: '.6rem .75rem', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
        <div style={{ fontSize: '.7rem', color: 'var(--text-2, #6b7280)', textTransform: 'uppercase', marginBottom: 4 }}>
          Wizard response
          {probe.wizard_refused ? ' (refused)' : ''}
          {probe.wizard_latency_ms != null ? ` · ${probe.wizard_latency_ms}ms` : ''}
        </div>
        {probe.wizard_error ? (
          <div style={{ color: '#991b1b', fontFamily: 'ui-monospace, monospace', fontSize: '.8rem' }}>
            error: {probe.wizard_error}
          </div>
        ) : (
          <>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '.85rem' }}>
              {truncated ? `${answer.slice(0, 400)}…` : answer || '(no answer text)'}
            </div>
            {answer.length > 400 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                style={{ background: 'transparent', border: 'none', color: '#4f46e5', cursor: 'pointer', padding: 0, marginTop: 4, fontSize: '.8rem' }}
              >
                {expanded ? 'Show less' : 'Show full response'}
              </button>
            )}
            {probe.wizard_refusal_reason && (
              <div style={{ marginTop: '.4rem', fontSize: '.8rem', color: '#991b1b' }}>
                Refusal reason: {probe.wizard_refusal_reason}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: '.6rem', fontSize: '.85rem' }}>
        <strong>Auditor summary.</strong> {probe.summary}
      </div>

      {probe.flags.length > 0 && (
        <div style={{ margin: '.5rem 0' }}>
          <div style={{ fontSize: '.75rem', color: 'var(--text-2, #6b7280)', textTransform: 'uppercase', marginBottom: 4 }}>Flags</div>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {probe.flags.map((flag, i) => (
              <li key={i} style={{ marginBottom: 3 }}>
                <span style={{ color: severityColor(flag.severity), fontWeight: 600, fontSize: '.75rem', textTransform: 'uppercase', marginRight: 6 }}>
                  {flag.severity}
                </span>
                <span style={{ color: 'var(--text-2, #6b7280)', fontSize: '.8rem', marginRight: 6 }}>
                  {DIMENSION_LABELS[flag.dimension] ?? flag.dimension}
                </span>
                {flag.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {probe.recommendations.length > 0 && (
        <div>
          <div style={{ fontSize: '.75rem', color: 'var(--text-2, #6b7280)', textTransform: 'uppercase', marginBottom: 4 }}>Recommendations</div>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {probe.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ProgressPanel({
  completed,
  total,
  latestProbeKey,
}: {
  completed: number
  total: number
  latestProbeKey: string | null
}) {
  const safeTotal = Math.max(total, 1)
  const pct = Math.min(100, Math.round((completed / safeTotal) * 100))
  const remaining = Math.max(total - completed, 0)
  const etaSeconds = remaining * 14 // ~14s/probe based on prior runs
  const etaLabel =
    etaSeconds >= 60
      ? `~${Math.round(etaSeconds / 60)} min remaining`
      : `~${etaSeconds}s remaining`

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        border: '1px solid #c7d2fe',
        background: '#eef2ff',
        borderRadius: 10,
        padding: '.9rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '.5rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
        <div>
          <div style={{ fontWeight: 600, color: '#312e81' }}>
            <Spinner /> Probing wizard — {pct}%
          </div>
          <div style={{ fontSize: '.85rem', color: '#4338ca', marginTop: 2 }}>
            {completed} / {total} probes complete · {etaLabel}
          </div>
        </div>
        <div style={{ fontSize: '.75rem', color: '#4338ca' }}>
          {latestProbeKey ? `Last completed: ${latestProbeKey}` : 'Waiting on first probe…'}
        </div>
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 999,
          background: '#e0e7ff',
          overflow: 'hidden',
          border: '1px solid #c7d2fe',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #6366f1, #4338ca)',
            transition: 'width .4s ease',
          }}
        />
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        border: '2px solid #6366f1',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        marginRight: 6,
        verticalAlign: -1,
        animation: 'spin 0.8s linear infinite',
      }}
    />
  )
}

const cellStyle: React.CSSProperties = {
  padding: '.55rem .75rem',
  verticalAlign: 'top',
}
