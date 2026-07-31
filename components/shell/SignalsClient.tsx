'use client'

import { useEffect, useState } from 'react'
import type { EngagementShiftResponse } from '@/lib/signals/engagementShift'

function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

export function SignalsClient() {
  const [data, setData] = useState<EngagementShiftResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setError(null)
        const res = await fetch('/api/signals')
        const body = (await res.json()) as EngagementShiftResponse & { error?: string }
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
        if (!cancelled) setData(body)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Signals failed')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <header className="page-header">
        <p className="eyebrow">Explore</p>
        <h1 className="page-title">People signals</h1>
        <p className="lede">
          Observation-based engagement shifts after manager changes. Logic uses quarterly
          engagement observations — never day-based windows. Admin and executive only.
        </p>
      </header>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {!data && !error ? <p className="admin-meta">Loading signals…</p> : null}

      {data ? (
        <>
          <p className="aa-caveat" role="note">
            {data.responsibleUseNotice}
          </p>
          <p className="admin-meta">
            Measure threshold: ±{data.threshold.toFixed(1)} points · source:{' '}
            {data.source === 'illustrative' ? 'illustrative demo' : 'live tables'}
          </p>
          <p className="aa-caveat">{data.note}</p>

          <div className="table-wrap" style={{ marginTop: '1.25rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Manager change</th>
                  <th>Pre observation</th>
                  <th>Pre value</th>
                  <th>First post</th>
                  <th>Post value</th>
                  <th>Δ</th>
                  <th>Second post</th>
                  <th>Threshold</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {data.signals.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.employeeId}
                      {s.illustrative ? (
                        <span className="org-chip" style={{ marginLeft: '0.35rem' }}>
                          illustrative
                        </span>
                      ) : null}
                    </td>
                    <td>{s.managerChangeDate}</td>
                    <td>{s.preObservationDate}</td>
                    <td>{fmt(s.preValue)}</td>
                    <td>{s.firstPostObservationDate}</td>
                    <td>{fmt(s.firstPostValue)}</td>
                    <td>{fmt(s.firstDelta)}</td>
                    <td>
                      {s.secondPostObservationDate
                        ? `${s.secondPostObservationDate} (${fmt(s.secondPostValue)})`
                        : '—'}
                    </td>
                    <td>±{fmt(s.threshold)}</td>
                    <td style={{ maxWidth: '28rem' }}>{s.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.signals.length === 0 ? (
            <p className="aa-caveat">No signals met the observation sufficiency and threshold rules.</p>
          ) : null}
        </>
      ) : null}
    </>
  )
}
