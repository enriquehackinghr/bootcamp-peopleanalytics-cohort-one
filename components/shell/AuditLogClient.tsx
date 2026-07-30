'use client'

import { useEffect, useState } from 'react'

type AuditRow = {
  event_id: string
  timestamp: string
  work_email: string | null
  app_role: string | null
  action: string
  outcome: string
  denial_reason: string | null
  target_type: string | null
  target_id: string | null
  tool_name: string | null
  route: string | null
}

const PAGE_LABELS: Record<string, string> = {
  '/overview': 'Executive Overview',
  '/workforce': 'Workforce',
  '/attrition': 'Attrition & Retention',
  '/compensation': 'Compensation',
  '/recruiting': 'Recruiting',
  '/engagement': 'Engagement',
  '/advanced-analytics': 'Advanced Analytics',
  '/workforce-planning': 'Workforce Planning',
  '/customized-reports': 'Customized Reports',
  '/find-employees': 'Employee Finder',
  '/org-chart': 'Org chart',
  '/methodology': 'Methodology',
  '/wizard-eval': 'Wizard evaluation',
  '/admin/upload': 'Data upload',
  '/audit': 'Audit log',
  '/wizard': 'Wizard',
  '/login': 'Sign in',
}

function pageLabelFromRoute(route: string | null | undefined): string | null {
  if (!route) return null
  const path = route.split('?')[0] || route
  if (PAGE_LABELS[path]) return PAGE_LABELS[path]
  if (path.startsWith('/employees/')) return `Employee 360 (${path.slice('/employees/'.length)})`
  if (path.startsWith('/managers/')) return `Manager detail (${path.slice('/managers/'.length)})`
  if (path.startsWith('/customized-reports/')) return 'Customized report detail'
  if (path.startsWith('/api/metrics/')) {
    const leaf = path.replace('/api/metrics/', '').split('/')[0]
    return `Metrics API · ${leaf}`
  }
  if (path.startsWith('/api/wizard')) return 'Wizard API'
  if (path.startsWith('/api/employees/search')) return 'Employee search API'
  if (path.startsWith('/api/ingest')) return 'Data upload API'
  if (path.startsWith('/api/')) return path
  return path
}

function actionLabel(row: AuditRow): string {
  const page = pageLabelFromRoute(row.route)
  switch (row.action) {
    case 'page_access':
      return page ? `Opened ${page}` : 'Opened page'
    case 'metrics_view':
      return page ? `Viewed metrics · ${page}` : 'Viewed metrics'
    case 'employee_search':
      return 'Searched employees'
    case 'employee_360':
      return row.target_id ? `Opened Employee 360 · ${row.target_id}` : 'Opened Employee 360'
    case 'wizard_query':
      return 'Wizard query'
    case 'wizard_refusal':
      return 'Wizard refusal'
    case 'wizard_tool_call':
      return row.tool_name ? `Wizard tool · ${row.tool_name}` : 'Wizard tool call'
    case 'login_success':
      return 'Signed in'
    case 'login_failed':
      return 'Sign-in failed'
    case 'logout':
      return 'Signed out'
    case 'permission_denial':
      return 'Permission denied'
    case 'data_upload':
      return 'Data upload'
    case 'planning_view':
      return 'Workforce planning'
    case 'audit_view':
      return 'Viewed audit log'
    case 'report_create':
    case 'report_update':
    case 'report_export':
      return row.action.replace(/_/g, ' ')
    default:
      return row.action.replace(/_/g, ' ')
  }
}

export function AuditLogClient() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/audit?limit=150')
        const body = (await res.json()) as { rows?: AuditRow[]; error?: string }
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
        if (!cancelled) setRows(body.rows ?? [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Audit load failed')
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 8000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return (
    <>
      <header className="page-header">
        <p className="eyebrow">Admin</p>
        <h1 className="page-title">Access audit log</h1>
        <p className="lede">
          Login, page access, Wizard tool calls, and permission denials. Each page visit names the
          screen opened. Sensitive values are redacted from metadata.
        </p>
      </header>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Role</th>
              <th>Action</th>
              <th>Page</th>
              <th>Outcome</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const page = pageLabelFromRoute(row.route)
              return (
                <tr key={row.event_id}>
                  <td>{new Date(row.timestamp).toLocaleString()}</td>
                  <td>{row.work_email ?? '—'}</td>
                  <td>{row.app_role ?? '—'}</td>
                  <td>{actionLabel(row)}</td>
                  <td>
                    {page ? (
                      <>
                        <div>{page}</div>
                        {row.route ? <div className="admin-meta">{row.route}</div> : null}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {row.outcome}
                    {row.denial_reason ? ` (${row.denial_reason})` : ''}
                  </td>
                  <td>
                    {[row.target_type, row.target_id, row.tool_name].filter(Boolean).join(' · ') ||
                      '—'}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && !error ? (
              <tr>
                <td colSpan={7}>No audit events yet (or table not migrated).</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  )
}
