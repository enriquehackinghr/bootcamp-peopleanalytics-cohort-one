'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import Link from 'next/link'
import type { OrgChartNode, OrgChartResponse } from '@/lib/db/orgChart'

/** Default: three levels from root (depths 0–2 open). */
const DEFAULT_OPEN_DEPTH = 2
const ZOOM_MIN = 0.45
const ZOOM_MAX = 1.6
const ZOOM_STEP = 0.1

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

function matchesQuery(node: OrgChartNode, query: string): boolean {
  if (!query) return false
  const hay = [node.fullName, node.title, node.department, node.employeeId, node.level]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(query)
}

function findPath(
  node: OrgChartNode,
  predicate: (n: OrgChartNode) => boolean,
  trail: OrgChartNode[] = [],
): OrgChartNode[] | null {
  const next = [...trail, node]
  if (predicate(node)) return next
  for (const child of node.children) {
    const hit = findPath(child, predicate, next)
    if (hit) return hit
  }
  return null
}

function collectOpenIds(node: OrgChartNode, maxDepth: number, depth = 0, out = new Set<string>()) {
  if (depth < maxDepth && node.children.length > 0) {
    out.add(node.employeeId)
    for (const child of node.children) collectOpenIds(child, maxDepth, depth + 1, out)
  }
  return out
}

function spanFlag(directReportCount: number): 'wide' | 'narrow' | null {
  if (directReportCount > 12) return 'wide'
  if (directReportCount > 0 && directReportCount < 3) return 'narrow'
  return null
}

function PersonBox({
  node,
  isRoot,
  hasChildren,
  open,
  onToggle,
  selected,
  highlighted,
  onSelect,
}: {
  node: OrgChartNode
  isRoot: boolean
  hasChildren: boolean
  open: boolean
  onToggle: () => void
  selected: boolean
  highlighted: boolean
  onSelect: () => void
}) {
  const isIc = node.directReportCount === 0
  const flag = spanFlag(node.directReportCount)
  const collapsedCount = !open && hasChildren ? node.teamSize || node.children.length : 0

  return (
    <div
      id={`org-node-${node.employeeId}`}
      role="treeitem"
      aria-expanded={hasChildren ? open : undefined}
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={[
        'org-box',
        isRoot ? 'org-box--root' : '',
        isIc ? 'org-box--ic' : '',
        selected ? 'org-box--selected' : '',
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
            onClick={(e) => e.stopPropagation()}
          >
            {node.fullName}
          </Link>
          <p className="org-box-title">{node.title || node.level || 'Role not listed'}</p>
        </div>
        {flag ? (
          <span
            className={`org-span-flag org-span-flag--${flag}`}
            title={
              flag === 'wide'
                ? `Span of control: ${node.directReportCount} direct reports (>12)`
                : `Span of control: ${node.directReportCount} direct report${node.directReportCount === 1 ? '' : 's'} (<3)`
            }
            aria-label={
              flag === 'wide' ? 'Wide span of control' : 'Narrow span of control'
            }
          />
        ) : null}
      </div>
      <div className="org-box-footer">
        <span className="org-chip org-chip--team" title="Team size (descendants)">
          {node.teamSize}
        </span>
        {node.directReportCount > 0 ? (
          <span className="org-chip">{node.directReportCount} dir</span>
        ) : null}
        {collapsedCount > 0 ? (
          <span className="org-badge-collapsed" title="Collapsed reports">
            +{collapsedCount}
          </span>
        ) : null}
        {hasChildren ? (
          <button
            type="button"
            className="org-expand"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
          >
            {open ? 'Collapse' : 'Expand'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function OrgBranch({
  node,
  depth,
  expandedIds,
  onToggle,
  selectedId,
  onSelect,
  highlightId,
}: {
  node: OrgChartNode
  depth: number
  expandedIds: Set<string>
  onToggle: (id: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
  highlightId: string | null
}) {
  const hasChildren = node.children.length > 0
  const open = hasChildren && expandedIds.has(node.employeeId)

  return (
    <div className="org-branch">
      <div className="org-branch-self">
        <PersonBox
          node={node}
          isRoot={depth === 0}
          hasChildren={hasChildren}
          open={open}
          onToggle={() => onToggle(node.employeeId)}
          selected={selectedId === node.employeeId}
          highlighted={highlightId === node.employeeId}
          onSelect={() => onSelect(node.employeeId)}
        />
      </div>

      {hasChildren && open ? (
        <div className="org-branch-down">
          <div className="org-stem" aria-hidden="true" />
          <div
            className={`org-rail${node.children.length === 1 ? ' org-rail--single' : ''}`}
          >
            {node.children.map((child) => (
              <div key={child.employeeId} className="org-rail-item">
                <div className="org-rail-drop" aria-hidden="true" />
                <OrgBranch
                  node={child}
                  depth={depth + 1}
                  expandedIds={expandedIds}
                  onToggle={onToggle}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  highlightId={highlightId}
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [zoom, setZoom] = useState(1)
  const panRef = useRef<HTMLDivElement>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setError(null)
        const res = await fetch('/api/org-chart')
        const body = (await res.json()) as OrgChartResponse & { error?: string }
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
        if (!cancelled) {
          setData(body)
          if (body.tree) {
            setExpandedIds(collectOpenIds(body.tree, DEFAULT_OPEN_DEPTH))
            setSelectedId(body.tree.employeeId)
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Org chart failed')
      }
    }
    void load()
    return () => {
      cancelled = true
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
    }
  }, [])

  const breadcrumb = useMemo(() => {
    if (!data?.tree || !selectedId) return [] as OrgChartNode[]
    return (
      findPath(data.tree, (n) => n.employeeId === selectedId) ?? [data.tree]
    )
  }, [data?.tree, selectedId])

  const toggleNode = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const flashHighlight = useCallback((id: string) => {
    setHighlightId(id)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightId(null), 1800)
  }, [])

  const scrollNodeIntoView = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`org-node-${id}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    })
  }, [])

  const locatePerson = useCallback(() => {
    if (!data?.tree) return
    const q = query.trim().toLowerCase()
    if (!q) return
    const path = findPath(data.tree, (n) => matchesQuery(n, q))
    if (!path) {
      setError(`No match for “${query.trim()}” in the visible org chart.`)
      return
    }
    setError(null)
    const target = path[path.length - 1]!
    setExpandedIds((prev) => {
      const next = new Set(prev)
      for (const node of path.slice(0, -1)) next.add(node.employeeId)
      return next
    })
    setSelectedId(target.employeeId)
    flashHighlight(target.employeeId)
    scrollNodeIntoView(target.employeeId)
  }, [data?.tree, query, flashHighlight, scrollNodeIntoView])

  const selectFromBreadcrumb = useCallback(
    (id: string) => {
      if (!data?.tree) return
      const path = findPath(data.tree, (n) => n.employeeId === id)
      if (!path) return
      setExpandedIds((prev) => {
        const next = new Set(prev)
        for (const node of path.slice(0, -1)) next.add(node.employeeId)
        return next
      })
      setSelectedId(id)
      scrollNodeIntoView(id)
    },
    [data?.tree, scrollNodeIntoView],
  )

  const setDepthPreset = useCallback(
    (maxDepth: number) => {
      if (!data?.tree) return
      setExpandedIds(collectOpenIds(data.tree, maxDepth))
    },
    [data?.tree],
  )

  const fitZoom = useCallback(() => {
    const pan = panRef.current
    if (!pan) {
      setZoom(1)
      return
    }
    const inner = pan.querySelector('.org-canvas-inner') as HTMLElement | null
    if (!inner) {
      setZoom(1)
      return
    }
    const available = pan.clientWidth - 32
    // scrollWidth is pre-transform; divide into available width for fit scale.
    const content = inner.scrollWidth || 1
    const next = Math.min(1, Math.max(ZOOM_MIN, available / content))
    setZoom(Number(next.toFixed(2)))
    pan.scrollLeft = 0
  }, [])

  const zoomStyle = useMemo(
    () =>
      ({
        '--org-zoom': String(zoom),
      }) as CSSProperties,
    [zoom],
  )

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
            <form
              className="org-search-form"
              onSubmit={(e) => {
                e.preventDefault()
                locatePerson()
              }}
            >
              <input
                className="login-input org-search"
                type="search"
                placeholder="Find a person…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Find a person in the org chart"
              />
              <button type="submit" className="btn">
                Locate
              </button>
            </form>
            <button type="button" className="btn" onClick={() => setDepthPreset(0)}>
              Root only
            </button>
            <button type="button" className="btn" onClick={() => setDepthPreset(2)}>
              3 levels
            </button>
            <button type="button" className="btn" onClick={() => setDepthPreset(5)}>
              Expand deep
            </button>
            <div className="org-zoom" role="group" aria-label="Zoom">
              <button
                type="button"
                className="btn"
                aria-label="Zoom out"
                onClick={() =>
                  setZoom((z) => Math.max(ZOOM_MIN, Number((z - ZOOM_STEP).toFixed(2))))
                }
              >
                −
              </button>
              <span className="org-zoom-label">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="btn"
                aria-label="Zoom in"
                onClick={() =>
                  setZoom((z) => Math.min(ZOOM_MAX, Number((z + ZOOM_STEP).toFixed(2))))
                }
              >
                +
              </button>
              <button type="button" className="btn" onClick={fitZoom}>
                Fit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {data?.tree && breadcrumb.length > 0 ? (
        <nav className="org-breadcrumb" aria-label="Reporting path">
          {breadcrumb.map((node, i) => (
            <span key={node.employeeId} className="org-breadcrumb-item">
              {i > 0 ? <span className="org-breadcrumb-sep" aria-hidden="true">/</span> : null}
              <button
                type="button"
                className={
                  node.employeeId === selectedId
                    ? 'org-breadcrumb-link org-breadcrumb-link--current'
                    : 'org-breadcrumb-link'
                }
                onClick={() => selectFromBreadcrumb(node.employeeId)}
              >
                {node.fullName}
              </button>
            </span>
          ))}
        </nav>
      ) : null}

      {data?.note ? <p className="aa-caveat">{data.note}</p> : null}
      {!data && !error ? <p className="admin-meta">Loading org chart…</p> : null}

      {data?.tree ? (
        <div className="org-canvas org-pan" ref={panRef} style={zoomStyle}>
          <div className="org-canvas-scale">
            <div className="org-canvas-inner" role="tree">
              <OrgBranch
                node={data.tree}
                depth={0}
                expandedIds={expandedIds}
                onToggle={toggleNode}
                selectedId={selectedId}
                onSelect={setSelectedId}
                highlightId={highlightId}
              />
            </div>
          </div>
        </div>
      ) : data && !error ? (
        <p className="aa-caveat">No reporting tree available for this session.</p>
      ) : null}
    </>
  )
}
