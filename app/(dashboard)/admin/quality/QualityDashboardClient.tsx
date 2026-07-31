'use client'

import { useEffect, useState } from 'react'

type ScoreSnapshot = {
  runId: string
  composite: number | null
  grade: string | null
  answerQuality?: number | null
  actionCompletion?: number | null
  wizardVersion?: string | null
  suiteVersion?: string | null
  evaluatorVersion?: string | null
  averageLatencyMs?: number | null
  estimatedCostUsd?: number | null
  tokenUsage?: Record<string, unknown> | null
  startedAt?: string
}

type RecentRun = {
  runId: string
  suite: string | null
  baselineLabel: string | null
  status: string
  composite: number | null
  grade: string | null
  answerQuality: number | null
  actionCompletion: number | null
  wizardVersion: string | null
  suiteVersion: string | null
  evaluatorVersion: string | null
  startedAt: string
}

type ProposalCounts =
  | {
      total: number
      pending: number
      approved: number
      rejected: number
      rolledBack: number
      retained: number
    }
  | { summaryOnly: true }

type QualityPayload = {
  suiteVersion: string
  evaluatorVersion: string
  liveSuite: { count: number; attackClasses: number; roles: string[] }
  class4Historical: {
    label: string
    composite: number
    grade: string
    probes: number
    note: string
  }
  class5Baseline: ScoreSnapshot | null
  class5Current: ScoreSnapshot | null
  class5PostImprovement: ScoreSnapshot | null
  recentRuns: RecentRun[]
  proposals: ProposalCounts
  wizardVersions: { current: string | null; previous: string | null }
  residualRisks: Array<Record<string, unknown>>
  openLimitations: string[]
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function formatScore(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return String(n)
}

function VersionMeta({
  suiteVersion,
  evaluatorVersion,
  wizardVersion,
  fallbackSuite,
  fallbackEvaluator,
}: {
  suiteVersion?: string | null
  evaluatorVersion?: string | null
  wizardVersion?: string | null
  fallbackSuite?: string
  fallbackEvaluator?: string
}) {
  const suite = suiteVersion ?? fallbackSuite ?? '—'
  const evaluator = evaluatorVersion ?? fallbackEvaluator ?? '—'
  const wizard = wizardVersion ?? '—'
  return (
    <p className="admin-meta">
      Suite {suite} · Evaluator {evaluator} · Wizard {wizard}
    </p>
  )
}

function ScoreBlock({
  title,
  subtitle,
  snapshot,
  fallbackSuite,
  fallbackEvaluator,
  showDimensions,
  badge,
}: {
  title: string
  subtitle?: string
  snapshot: ScoreSnapshot | null
  fallbackSuite?: string
  fallbackEvaluator?: string
  showDimensions?: boolean
  badge?: string
}) {
  return (
    <article className="admin-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'baseline' }}>
        <h3 className="admin-card-title">{title}</h3>
        {badge ? (
          <span className="admin-meta" style={{ margin: 0 }}>
            {badge}
          </span>
        ) : null}
      </div>
      {subtitle ? <p className="admin-meta">{subtitle}</p> : null}
      {!snapshot ? (
        <p className="admin-meta">No run recorded yet.</p>
      ) : (
        <>
          <p style={{ margin: '0.35rem 0', fontSize: '1.75rem', fontWeight: 600 }}>
            {formatScore(snapshot.composite)}
            {snapshot.grade ? (
              <span style={{ marginLeft: '0.5rem', fontSize: '1.1rem' }}>/ {snapshot.grade}</span>
            ) : null}
          </p>
          {showDimensions ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
              <div>
                <p className="admin-meta" style={{ margin: 0 }}>
                  Answer quality
                </p>
                <p className="admin-card-title">{formatScore(snapshot.answerQuality)}</p>
              </div>
              <div>
                <p className="admin-meta" style={{ margin: 0 }}>
                  Action completion
                </p>
                <p className="admin-card-title">{formatScore(snapshot.actionCompletion)}</p>
              </div>
            </div>
          ) : null}
          <VersionMeta
            suiteVersion={snapshot.suiteVersion}
            evaluatorVersion={snapshot.evaluatorVersion}
            wizardVersion={snapshot.wizardVersion}
            fallbackSuite={fallbackSuite}
            fallbackEvaluator={fallbackEvaluator}
          />
          {snapshot.startedAt ? (
            <p className="admin-meta">Started {formatWhen(snapshot.startedAt)}</p>
          ) : null}
          {(snapshot.averageLatencyMs != null || snapshot.estimatedCostUsd != null) && (
            <p className="admin-meta">
              {snapshot.averageLatencyMs != null
                ? `Latency ${Math.round(snapshot.averageLatencyMs)} ms`
                : null}
              {snapshot.averageLatencyMs != null && snapshot.estimatedCostUsd != null ? ' · ' : null}
              {snapshot.estimatedCostUsd != null
                ? `Est. cost $${Number(snapshot.estimatedCostUsd).toFixed(4)}`
                : null}
            </p>
          )}
        </>
      )}
    </article>
  )
}

export function QualityDashboardClient() {
  const [data, setData] = useState<QualityPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/admin/quality')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load quality dashboard')
        if (!cancelled) {
          setData(json as QualityPayload)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load quality dashboard')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const proposalSummary =
    data && !('summaryOnly' in data.proposals) ? data.proposals : null

  return (
    <div className="methodology-page admin-page">
      <header className="methodology-header admin-header">
        <p className="eyebrow">Admin</p>
        <h2 className="card-title">AI Quality &amp; Reliability</h2>
        <p className="card-subtitle lede">
          Class 5 baselines, suite versions, residual risks, and improvement
          proposal status. Class 4 scores are historical only and never compared
          to Class 5 suite results.
        </p>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!data && !error && <p className="admin-meta">Loading quality dashboard…</p>}

      {data && (
        <>
          <section className="admin-section">
            <h2 className="card-title">Suite &amp; versions</h2>
            <p className="admin-meta">
              Live suite: {data.liveSuite.count} probes · {data.liveSuite.attackClasses}{' '}
              attack classes · roles {data.liveSuite.roles.join(', ') || '—'}
            </p>
            <p className="admin-meta">
              Suite {data.suiteVersion} · Evaluator {data.evaluatorVersion} · Wizard{' '}
              {data.wizardVersions.current ?? '—'}
              {data.wizardVersions.previous
                ? ` (previous ${data.wizardVersions.previous})`
                : ''}
            </p>
          </section>

          <section className="admin-section">
            <h2 className="card-title">Class 4 historical baseline</h2>
            <p className="admin-meta">{data.class4Historical.note}</p>
            <article className="admin-card">
              <h3 className="admin-card-title">{data.class4Historical.label}</h3>
              <p style={{ margin: '0.35rem 0', fontSize: '1.75rem', fontWeight: 600 }}>
                {data.class4Historical.composite}
                <span style={{ marginLeft: '0.5rem', fontSize: '1.1rem' }}>
                  / {data.class4Historical.grade}
                </span>
              </p>
              <p className="admin-meta">
                Historical · {data.class4Historical.probes} probes · not comparable to Class 5
              </p>
              <VersionMeta
                suiteVersion="class4-historical"
                evaluatorVersion="class4-eval"
                wizardVersion="n/a"
              />
            </article>
          </section>

          <section className="admin-section">
            <h2 className="card-title">Class 5 baseline vs current</h2>
            <p className="admin-meta">
              Answer quality and action completion are shown separately for each Class 5
              snapshot.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '0.75rem',
              }}
            >
              <ScoreBlock
                title="Class 5 baseline"
                snapshot={data.class5Baseline}
                fallbackSuite={data.suiteVersion}
                fallbackEvaluator={data.evaluatorVersion}
                showDimensions
                badge="baseline"
              />
              <ScoreBlock
                title="Current / latest Class 5"
                snapshot={data.class5Current}
                fallbackSuite={data.suiteVersion}
                fallbackEvaluator={data.evaluatorVersion}
                showDimensions
                badge="current"
              />
              <ScoreBlock
                title="Post-improvement"
                snapshot={data.class5PostImprovement}
                fallbackSuite={data.suiteVersion}
                fallbackEvaluator={data.evaluatorVersion}
                showDimensions
                badge="post-improvement"
              />
            </div>
          </section>

          <section className="admin-section">
            <h2 className="card-title">Proposal counts</h2>
            {proposalSummary ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                {(
                  [
                    ['Total', proposalSummary.total],
                    ['Pending', proposalSummary.pending],
                    ['Approved', proposalSummary.approved],
                    ['Rejected', proposalSummary.rejected],
                    ['Rolled back', proposalSummary.rolledBack],
                    ['Retained', proposalSummary.retained],
                  ] as const
                ).map(([label, value]) => (
                  <article key={label} className="admin-card">
                    <p className="admin-meta" style={{ margin: 0 }}>
                      {label}
                    </p>
                    <p className="admin-card-title" style={{ fontSize: '1.4rem' }}>
                      {value}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="admin-meta">
                Proposal detail is admin-only. Summary available to executives via API
                read-only access.
              </p>
            )}
          </section>

          <section className="admin-section">
            <h2 className="card-title">Recent runs</h2>
            {data.recentRuns.length === 0 ? (
              <p className="admin-meta">No adversarial runs yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Started</th>
                      <th>Suite</th>
                      <th>Baseline</th>
                      <th>Grade</th>
                      <th>Answer</th>
                      <th>Action</th>
                      <th>Versions</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentRuns.map((run) => (
                      <tr key={run.runId}>
                        <td>{formatWhen(run.startedAt)}</td>
                        <td>{run.suite ?? '—'}</td>
                        <td>{run.baselineLabel ?? '—'}</td>
                        <td>
                          {formatScore(run.composite)}
                          {run.grade ? ` / ${run.grade}` : ''}
                        </td>
                        <td>{formatScore(run.answerQuality)}</td>
                        <td>{formatScore(run.actionCompletion)}</td>
                        <td>
                          <span className="admin-meta" style={{ margin: 0 }}>
                            S {run.suiteVersion ?? '—'} · E {run.evaluatorVersion ?? '—'} · W{' '}
                            {run.wizardVersion ?? '—'}
                          </span>
                        </td>
                        <td>{run.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="admin-section">
            <h2 className="card-title">Residual risks</h2>
            {data.residualRisks.length === 0 ? (
              <p className="admin-meta">No residual risks recorded.</p>
            ) : (
              <ul className="admin-history">
                {data.residualRisks.map((risk, i) => {
                  const id = String(risk.risk_id ?? risk.id ?? i)
                  const title = String(risk.title ?? risk.risk_id ?? 'Residual risk')
                  const owner = risk.owner != null ? String(risk.owner) : null
                  return (
                    <li key={id} className="admin-history-item">
                      <div>
                        <p className="admin-card-title">{title}</p>
                        <p className="admin-meta">
                          {id}
                          {owner ? ` · owner ${owner}` : ''}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="admin-section">
            <h2 className="card-title">Open limitations</h2>
            <ul>
              {data.openLimitations.map((item) => (
                <li key={item}>
                  <p className="admin-meta" style={{ margin: '0.35rem 0' }}>
                    {item}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
