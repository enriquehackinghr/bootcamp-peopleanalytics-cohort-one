'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { MetricChart } from '@/components/charts/MetricChart'
import { DetailTableView } from '@/components/shell/DetailTableView'
import { SourceLine } from '@/components/shell/SourceLine'
import type { AttritionRiskScore, Employee360Response } from '@/lib/types'

export function Employee360Client() {
  const params = useParams<{ employeeId: string }>()
  const employeeId = params.employeeId
  const [data, setData] = useState<Employee360Response | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setError(null)
        const res = await fetch(
          `/api/metrics/employees/${encodeURIComponent(employeeId)}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        )
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const json = (await res.json()) as Employee360Response
        if (!cancelled) setData(json)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load employee 360')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [employeeId])

  return (
    <>
      <header className="page-header">
        <p className="eyebrow">Employee 360</p>
        <h1 className="page-title">
          {data?.profile?.name
            ? String(data.profile.name)
            : data?.profile?.first_name
              ? `${data.profile.first_name} ${data.profile.last_name ?? ''}`.trim()
              : `Employee ${employeeId}`}
        </h1>
        <p className="lede">
          Timeline, compensation, performance, talent, engagement (0–10 instrument only), and
          transparent retention-risk factors. Field access follows your role and reporting tree.
        </p>
        <p>
          <Link href="/find-employees">← Employee Finder</Link>
        </p>
      </header>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {data?.profile ? (
        <article className="card">
          <h2 className="card-title">Role and organisational context</h2>
          <dl className="profile-grid">
            {Object.entries(data.profile).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v == null ? '—' : String(v)}</dd>
              </div>
            ))}
          </dl>
        </article>
      ) : null}

      <SourceLine freshness={data?.freshness} tables={['employees', 'employee_snapshots']} />

      {data?.risk ? <RiskBreakdown risk={data.risk} /> : null}

      {(data?.modules ?? []).map((mod) => (
        <DetailTableView key={mod.id} table={mod.rows} />
      ))}

      <section className="chart-grid">
        {(data?.charts ?? []).map((chart) => (
          <MetricChart key={chart.id} chart={chart} freshness={data?.freshness} />
        ))}
      </section>

      {data?.dataSufficiencyNote ? (
        <p className="aa-caveat">{data.dataSufficiencyNote}</p>
      ) : null}
      <p className="aa-caveat">
        {data?.responsibleUseNote ||
          'Retention-risk indicators are a prompt to investigate, not a verdict about a person.'}
      </p>
    </>
  )
}

function RiskBreakdown({ risk }: { risk: AttritionRiskScore }) {
  return (
    <article className="card risk-breakdown">
      <h2 className="card-title">Retention-risk indicator (risk-v0.2)</h2>
      <p>
        Score:{' '}
        <strong>
          {risk.total_score == null ? '—' : risk.total_score.toFixed(0)}
        </strong>
        {risk.risk_band ? ` · ${risk.risk_band}` : ' · no band (insufficient data)'}
      </p>
      <p>
        Sufficiency: {risk.data_sufficiency} · available factors{' '}
        {risk.available_factor_count}/{risk.available_factor_count + risk.missing_factor_count} ·
        methodology {risk.methodology_version}
      </p>
      <table className="detail-table">
        <thead>
          <tr>
            <th>Factor</th>
            <th>Status</th>
            <th>Points</th>
            <th>Max</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {risk.factors.map((f) => (
            <tr key={f.factor}>
              <td>{f.factor}</td>
              <td>{f.status}</td>
              <td>{f.points}</td>
              <td>{f.maximum_points}</td>
              <td>{f.reason || f.missing_reason || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="aa-caveat">
        A prompt to investigate, not a verdict about a person. No fitted model —
        declared weights only.
      </p>
    </article>
  )
}
