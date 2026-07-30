'use client'

import { useEffect, useState } from 'react'
import { SourceLine } from '@/components/shell/SourceLine'
import type { PlanningPageResponse } from '@/lib/db/planning'

export function WorkforcePlanningClient() {
  const [data, setData] = useState<PlanningPageResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uplift, setUplift] = useState(10)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setError(null)
        const res = await fetch('/api/metrics/planning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ growthUpliftPct: uplift }),
        })
        const body = (await res.json()) as PlanningPageResponse & { error?: string }
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
        if (!cancelled) setData(body)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Planning failed')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [uplift])

  const r = data?.reconciliation

  return (
    <>
      <header className="page-header">
        <p className="eyebrow">Workforce planning</p>
        <h1 className="page-title">Plan versus actual</h1>
        <p className="lede">
          Headcount attainment and hiring attainment are separate measures. Scenarios are
          assumption-based — not AI predictions. Reporting boundary:{' '}
          {data?.reportingBoundary ?? '…'}.
        </p>
      </header>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="kpi-strip">
        <article className="kpi-tile">
          <p className="kpi-label">Actual headcount</p>
          <p className="kpi-value">
            {r?.actualHeadcountAtBoundary?.toLocaleString() ?? '—'}
          </p>
        </article>
        <article className="kpi-tile">
          <p className="kpi-label">Payroll run rate (base)</p>
          <p className="kpi-value">
            {r?.payrollRunRate != null
              ? `$${Math.round(r.payrollRunRate).toLocaleString()}`
              : '—'}
          </p>
        </article>
        <article className="kpi-tile">
          <p className="kpi-label">Approved FY26 budget</p>
          <p className="kpi-value">
            {r?.approvedBudget != null
              ? `$${Math.round(r.approvedBudget).toLocaleString()}`
              : 'n/a'}
          </p>
        </article>
        <article className="kpi-tile">
          <p className="kpi-label">Growth projection</p>
          <p className="kpi-value">
            {data?.growthScenario.projectedFyeHeadcount?.toLocaleString() ?? '—'}
          </p>
        </article>
      </section>

      <SourceLine freshness={data?.freshness} tables={['employees', 'fy26_comp_budget']} />

      <article className="card" style={{ marginTop: '1.5rem' }}>
        <h2 className="card-title">Growth scenario assumptions</h2>
        <p className="aa-caveat">{data?.growthScenario.note}</p>
        <label className="login-label" htmlFor="uplift">
          Hiring target uplift %
        </label>
        <input
          id="uplift"
          className="login-input"
          type="number"
          min={0}
          max={100}
          value={uplift}
          onChange={(e) => setUplift(Number(e.target.value) || 0)}
        />
        {data?.growthScenario.bindingConstraint ? (
          <p className="error">
            Binding constraint: {data.growthScenario.bindingConstraint}
          </p>
        ) : null}
      </article>

      <div className="table-wrap" style={{ marginTop: '1.5rem' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Function</th>
              <th>Actual HC</th>
              <th>Planned HC</th>
              <th>HC attainment</th>
              <th>Hiring attainment</th>
            </tr>
          </thead>
          <tbody>
            {(data?.planVsActual ?? []).map((row) => (
              <tr key={row.functionName}>
                <td>{row.functionName}</td>
                <td>{row.actualHeadcount ?? '—'}</td>
                <td>{row.plannedHeadcount ?? 'null — no plan line'}</td>
                <td>
                  {row.headcountAttainment != null
                    ? `${(row.headcountAttainment * 100).toFixed(1)}%`
                    : '—'}
                </td>
                <td>
                  {row.hiringAttainment != null
                    ? `${(row.hiringAttainment * 100).toFixed(1)}%`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
