'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { OrgChartNode, OrgChartResponse } from '@/lib/db/orgChart'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

function matchesQuery(node: OrgChartNode, query: string): boolean {
  if (!query) return true
  const hay = [node.fullName, node.title, node.department, node.employeeId, node.level]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(query)
}

function subtreeMatches(node: OrgChartNode, query: string): boolean {
  if (!query) return true
  if (matchesQuery(node, query)) return true
  return node.children.some((c) => subtreeMatches(c, query))
}

function PersonBox({
  node,
  isRoot,
  hasChildren,
  open,
  onToggle,
  dimmed,
  highlighted,
}: {
  node: OrgChartNode
  isRoot: boolean
  hasChildren: boolean
  open: boolean
  onToggle: () => void
  dimmed: boolean
  highlighted: boolean
}) {
  return (
    <div
      className={[
        'org-box',
        isRoot ? 'org-box--root' : '',
        dimmed ? 'org-box--dim' : '',
        highlighted ? 'org-box--hit' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="org-box-top">
        <span className="org-avatar" aria-hidden="true">
          {initials(node.fullName)}
        </span>
        <div className="org-box-copy">
          <Link
            href={`/employees/${encodeURIComponent(node.employeeId)}`}
            className="org-box-name"
          >
            {node.fullName}
          </Link>
          <p className="org-box-title">{node.title || node.level || 'Role not listed'}</p>
          <p className="org-box-dept">
            {[node.department, node.location].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      </div>
      <div className="org-box-footer">
        <span className="org-chip">{node.employeeId}</span>
        <span className="org-chip org-chip--team">
          Team {node.teamSize}
          {node.directReportCount > 0 ? ` · ${node.directReportCount} direct` : ''}
        </span>
        {hasChildren ? (
          <button
            type="button"
            className="org-expand"
            aria-expanded={open}
            onClick={onToggle}
          >
            {open ? 'Hide reports' : `Show ${node.directReportCount}`}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function OrgBranch({
  node,
  depth,
  openThrough,
  query,
}: {
  node: OrgChartNode
  depth: number
  openThrough: number
  query: string
}) {
  const hasChildren = node.children.length > 0
  const q = query.trim().toLowerCase()
  const [open, setOpen] = useState(() => {
    if (q) return subtreeMatches(node, q)
    return depth < openThrough
  })

  useEffect(() => {
    if (q) {
      setOpen(subtreeMatches(node, q))
    } else {
      setOpen(depth < openThrough)
    }
  }, [depth, openThrough, q, node])

  const hit = Boolean(q) && matchesQuery(node, q)
  const dimmed = Boolean(q) && !hit && !subtreeMatches(node, q)

  const visibleChildren = q
    ? node.children.filter((c) => subtreeMatches(c, q))
    : node.children

  return (
    <div className="org-branch">
      <div className="org-branch-self">
        <PersonBox
          node={node}
          isRoot={depth === 0}
          hasChildren={hasChildren}
          open={open}
          onToggle={() => setOpen((v) => !v)}
          dimmed={dimmed}
          highlighted={hit}
        />
      </div>

      {hasChildren && open && visibleChildren.length > 0 ? (
        <div className="org-branch-down">
          <div className="org-stem" aria-hidden="true" />
          <div
            className={`org-rail${visibleChildren.length === 1 ? ' org-rail--single' : ''}`}
          >
            {visibleChildren.map((child) => (
              <div key={child.employeeId} className="org-rail-item">
                <div className="org-rail-drop" aria-hidden="true" />
                <OrgBranch
                  node={child}
                  depth={depth + 1}
                  openThrough={openThrough}
                  query={query}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function OrgChartClient() {
  const [data, setData] = useState<OrgChartResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openThrough, setOpenThrough] = useState(1)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setError(null)
        const res = await fetch('/api/org-chart')
        const body = (await res.json()) as OrgChartResponse & { error?: string }
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
        if (!cancelled) setData(body)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Org chart failed')
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
        <p className="eyebrow">People</p>
        <h1 className="page-title">Org chart</h1>
        <p className="lede">
          Visual reporting tree from current manager lines.
          {data?.rootMode === 'manager'
            ? ' Rooted at you and your team.'
            : ' Rooted at the CEO.'}{' '}
          Click a name for Employee 360. Data as of {data?.reportingBoundary ?? '…'}.
        </p>
      </header>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {data ? (
        <div className="org-toolbar">
          <p className="admin-meta">
            {data.nodeCount.toLocaleString()} people · root {data.rootEmployeeId}
          </p>
          <div className="org-toolbar-actions">
            <input
              className="login-input org-search"
              type="search"
              placeholder="Find a name in the chart…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Find a name in the org chart"
            />
            <button type="button" className="btn" onClick={() => setOpenThrough(0)}>
              Root only
            </button>
            <button type="button" className="btn" onClick={() => setOpenThrough(1)}>
              +1 level
            </button>
            <button type="button" className="btn" onClick={() => setOpenThrough(2)}>
              +2 levels
            </button>
          </div>
        </div>
      ) : null}

      {data?.note ? <p className="aa-caveat">{data.note}</p> : null}
      {!data && !error ? <p className="admin-meta">Loading org chart…</p> : null}

      {data?.tree ? (
        <div className="org-canvas">
          <div className="org-canvas-inner">
            <OrgBranch
              node={data.tree}
              depth={0}
              openThrough={openThrough}
              query={query}
            />
          </div>
        </div>
      ) : data && !error ? (
        <p className="aa-caveat">No reporting tree available for this session.</p>
      ) : null}
    </>
  )
}
