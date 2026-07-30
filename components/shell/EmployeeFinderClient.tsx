'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { FinderRow } from '@/lib/db/employees'

export function EmployeeFinderClient() {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<FinderRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [department, setDepartment] = useState('')
  const [boundary, setBoundary] = useState<string | null>(null)

  useEffect(() => {
    if (query.trim().length < 2 && !department) {
      setRows([])
      return
    }
    const handle = setTimeout(async () => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch('/api/employees/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            department: department || undefined,
          }),
        })
        const body = (await res.json()) as {
          rows?: FinderRow[]
          error?: string
          reportingBoundary?: string
        }
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
        setRows(body.rows ?? [])
        setBoundary(body.reportingBoundary ?? null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed')
      } finally {
        setBusy(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [query, department])

  return (
    <>
      <header className="page-header">
        <p className="eyebrow">People</p>
        <h1 className="page-title">Employee Finder</h1>
        <p className="lede">
          Search the population you are authorized to see. Results respect current reporting-tree
          scope.
          {boundary ? ` Data as of ${boundary}.` : ''}
        </p>
      </header>

      <div className="finder-controls">
        <input
          className="login-input"
          type="search"
          placeholder="Search name, ID, department, title, location…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search employees"
        />
        <input
          className="login-input"
          type="text"
          placeholder="Filter department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          aria-label="Department filter"
        />
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {busy ? <p className="admin-meta">Searching…</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Title / family</th>
              <th>Department</th>
              <th>Manager</th>
              <th>Tenure</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employeeId}>
                <td>
                  <Link href={`/employees/${encodeURIComponent(row.employeeId)}`}>
                    {row.fullName}
                  </Link>
                  <div className="admin-meta">{row.employeeId}</div>
                </td>
                <td>{row.title ?? '—'}</td>
                <td>{row.department ?? row.functionName ?? '—'}</td>
                <td>{row.managerName ?? '—'}</td>
                <td>{row.tenureYears != null ? `${row.tenureYears}y` : '—'}</td>
                <td>{row.location ?? '—'}</td>
              </tr>
            ))}
            {!busy && rows.length === 0 && query.trim().length >= 2 ? (
              <tr>
                <td colSpan={6}>No matching employees in your visible population.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  )
}
