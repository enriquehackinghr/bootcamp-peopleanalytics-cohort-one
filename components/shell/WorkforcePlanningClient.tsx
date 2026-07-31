'use client'

import { useEffect, useState } from 'react'
import { SourceLine } from '@/components/shell/SourceLine'
import type { PlanningPageResponse } from '@/lib/db/planning'

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${Math.round(n).toLocaleString()}`
}

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
        <h1 className="page-title">Plan versus estimated expense</h1>
        <p className="lede">
          Headcount attainment and hiring attainment are separate measures. Compensation
          figures are estimated base-salary expense — not actual payroll spend. Scenarios
          are assumption-based — not AI predictions. Reporting boundary:{' '}
          {data?.reportingBoundary ?? '…'}.
        </p>
      </header>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {data?.terminologyNote ? <p className="aa-caveat">{data.terminologyNote}</p> : null}

      <section className="kpi-strip">
        <article className="kpi-tile">
          <p className="kpi-label">Actual headcount</p>
          <p className="kpi-value">
            {r?.actualHeadcountAtBoundary?.toLocaleString() ?? '—'}
          </p>
        </article>
        <article className="kpi-tile">
          <p className="kpi-label">Est. FY base-salary expense</p>
          <p className="kpi-value">{money(r?.estimatedFyBaseSalaryExpense)}</p>
        </article>
        <article className="kpi-tile">
          <p className="kpi-label">Approved FY26 budget</p>
          <p className="kpi-value">
            {r?.approvedBudget != null ? money(r.approvedBudget) : 'n/a'}
          </p>
        </article>
        <article className="kpi-tile">
          <p className="kpi-label">
            Budget variance
            {r?.budgetVarianceLabel === 'over_budget'
              ? ' (over)'
              : r?.budgetVarianceLabel === 'under_budget'
                ? ' (under)'
                : ''}
          </p>
          <p className="kpi-value">{money(r?.budgetVariance)}</p>
        </article>
      </section>

      <section className="kpi-strip" style={{ marginTop: '0.75rem' }}>
        <article className="kpi-tile">
          <p className="kpi-label">Through boundary</p>
          <p className="kpi-value">{money(r?.estimatedExpenseThroughBoundary)}</p>
        </article>
        <article className="kpi-tile">
          <p className="kpi-label">Remaining forecast</p>
          <p className="kpi-value">{money(r?.forecastRemainingExpense)}</p>
        </article>
        <article className="kpi-tile">
          <p className="kpi-label">Vacancy savings (memo only)</p>
          <p className="kpi-value">{money(r?.vacancySavingsMemo)}</p>
        </article>
        <article className="kpi-tile">
          <p className="kpi-label">Annualized run rate (info)</p>
          <p className="kpi-value">
            {money(r?.annualizedRunRateInformational ?? r?.payrollRunRate)}
          </p>
        </article>
      </section>

      <SourceLine
        freshness={data?.freshness}
        tables={['employees', 'employee_snapshots', 'fy26_comp_budget', 'requisitions', 'recruiters']}
      />

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
        <p className="admin-meta" style={{ marginTop: '0.75rem' }}>
          Projected FYE headcount:{' '}
          {data?.growthScenario.projectedFyeHeadcount?.toLocaleString() ?? '—'}
        </p>
        {data?.growthScenario.bindingConstraintDetail ? (
          <p className="aa-caveat" style={{ marginTop: '0.5rem' }}>
            {data.growthScenario.bindingConstraintDetail}
          </p>
        ) : data?.growthScenario.bindingConstraint ? (
          <p className="aa-caveat">
            Binding constraint: {data.growthScenario.bindingConstraint}
          </p>
        ) : null}
        {data?.growthScenario.pipelineCapacity != null ||
        data?.growthScenario.recruiterCapacity != null ? (
          <p className="admin-meta">
            Pipeline capacity {data.growthScenario.pipelineCapacity ?? '—'} · Recruiter
            capacity {data.growthScenario.recruiterCapacity ?? '—'}
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
