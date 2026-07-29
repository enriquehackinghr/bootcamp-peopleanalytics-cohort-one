'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useState } from 'react'
import type { ChartPayload, DataFreshness } from '@/lib/types'
import { SourceLine } from '@/components/shell/SourceLine'
import { useFiltersOptional } from '@/components/shell/FilterProvider'
import { DetailTableView } from '@/components/shell/DetailTableView'

const SERIES = [
  'var(--s1)',
  'var(--s2)',
  'var(--s3)',
  'var(--s4)',
  'var(--s5)',
  'var(--s6)',
  'var(--s7)',
  'var(--s8)',
]

function toBarRows(chart: ChartPayload): Record<string, string | number>[] {
  if (chart.form === 'stacked_bar' && chart.seriesKeys?.length) {
    const byX = new Map<string, Record<string, string | number>>()
    for (const point of chart.points) {
      const key = String(point.x)
      const row = byX.get(key) ?? { x: key }
      if (point.series) row[point.series] = point.y
      byX.set(key, row)
    }
    return [...byX.values()]
  }

  return chart.points.map((point) => ({
    x: String(point.x),
    y: point.y,
    label: point.label ?? String(point.x),
  }))
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function chartToCsv(chart: ChartPayload): string {
  const headers = ['x', 'y', 'series', 'label']
  const lines = [headers.join(',')]
  for (const p of chart.points) {
    lines.push(
      [p.x, p.y, p.series ?? '', p.label ?? '']
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    )
  }
  return lines.join('\n')
}

function RichTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="chart-tooltip-row">
          <span
            className="chart-tooltip-swatch"
            style={{ background: p.color ?? 'var(--s1)' }}
          />
          <span>
            {p.name ?? 'value'}: <strong>{p.value}</strong>
          </span>
        </div>
      ))}
    </div>
  )
}

export function MetricChart({
  chart,
  freshness,
  sourceTables,
}: {
  chart: ChartPayload
  freshness?: DataFreshness | null
  sourceTables?: string[]
}) {
  const filtersApi = useFiltersOptional()
  const cross = filtersApi?.filters.crossFilter ?? null
  const [showTable, setShowTable] = useState(false)

  const empty =
    chart.suppressed ||
    !chart.points.length ||
    Boolean(chart.emptyReason && !chart.points.some((p) => p.y > 0))

  function onMarkClick(value: string) {
    if (!filtersApi) return
    filtersApi.setCrossFilter({ dimension: chart.dimension, value })
    // Org hierarchy drill-down from function composition (CAP-6).
    if (chart.dimension === 'function' || chart.id === 'composition_by_function') {
      const path = filtersApi.filters.drill?.path ?? []
      if (!path.length) {
        filtersApi.drillInto('org', [value])
      } else if (path.length === 1) {
        filtersApi.drillInto('org', [path[0], value])
      }
    }
  }

  if (empty) {
    return (
      <article className="card chart-card">
        <div className="chart-card-header">
          <h3 className="card-title">{chart.title}</h3>
          <ChartMenu chart={chart} onViewTable={() => setShowTable(true)} />
        </div>
        <p className="card-subtitle">
          {chart.emptyReason || 'No data for this chart yet.'}
        </p>
        {filtersApi?.filters.functions.length ||
        filtersApi?.filters.locations.length ||
        filtersApi?.filters.crossFilter ? (
          <button
            type="button"
            className="filter-clear"
            onClick={() => filtersApi?.clearFilters()}
          >
            Clear filters that emptied this view
          </button>
        ) : null}
        <SourceLine freshness={freshness} tables={sourceTables} />
      </article>
    )
  }

  const rows = toBarRows(chart)
  const horizontal =
    chart.form === 'horizontal_bar' || chart.form === 'stage_bars'
  const stacked = chart.form === 'stacked_bar'
  const isLine = chart.form === 'line'
  const seriesKeys = chart.seriesKeys?.length
    ? chart.seriesKeys
    : stacked
      ? [...new Set(chart.points.map((p) => p.series).filter(Boolean) as string[])]
      : ['y']

  return (
    <article className="card chart-card">
      <div className="chart-card-header">
        <div>
          <h3 className="card-title">{chart.title}</h3>
          <p className="card-subtitle">{chart.summary}</p>
          <p className="sr-only">{chart.summary}</p>
        </div>
        <ChartMenu chart={chart} onViewTable={() => setShowTable((v) => !v)} />
      </div>
      <div className="chart-frame" tabIndex={0} aria-label={chart.title}>
        <ResponsiveContainer width="100%" height="100%">
          {isLine ? (
            <LineChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="x" tick={{ fill: 'var(--ink-subtle)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--ink-subtle)', fontSize: 11 }} />
              <Tooltip content={<RichTooltip />} />
              {(chart.referenceLines ?? []).map((r) => (
                <ReferenceLine
                  key={r.label}
                  y={r.value}
                  stroke="var(--ink-subtle)"
                  strokeDasharray="4 4"
                  label={{ value: r.label, fill: 'var(--ink-subtle)', fontSize: 11 }}
                />
              ))}
              <Line
                type="monotone"
                dataKey="y"
                stroke={SERIES[0]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          ) : horizontal ? (
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 8, right: 28, left: 8, bottom: 8 }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fill: 'var(--ink-subtle)', fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="x"
                width={110}
                tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
              />
              <Tooltip content={<RichTooltip />} />
              {(chart.referenceLines ?? []).map((r) => (
                <ReferenceLine
                  key={r.label}
                  x={r.value}
                  stroke="var(--ink-subtle)"
                  strokeDasharray="4 4"
                  label={{ value: r.label, fill: 'var(--ink-subtle)', fontSize: 11 }}
                />
              ))}
              <Bar
                dataKey="y"
                radius={[0, 6, 6, 0]}
                maxBarSize={22}
                cursor="pointer"
                onClick={(data) => {
                  const payload = data as unknown as { payload?: { x?: string }; x?: string }
                  const x = String(payload.payload?.x ?? payload.x ?? '')
                  if (x) onMarkClick(x)
                }}
              >
                {rows.map((row, index) => {
                  const selected =
                    !cross ||
                    (cross.dimension === chart.dimension &&
                      cross.value === String(row.x))
                  return (
                    <Cell
                      key={index}
                      fill={SERIES[index % SERIES.length]}
                      fillOpacity={selected ? 1 : 0.28}
                    />
                  )
                })}
                <LabelList dataKey="y" position="right" fill="var(--ink-muted)" fontSize={11} />
              </Bar>
            </BarChart>
          ) : (
            <BarChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="x" tick={{ fill: 'var(--ink-subtle)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--ink-subtle)', fontSize: 11 }} />
              <Tooltip content={<RichTooltip />} />
              {(chart.referenceLines ?? []).map((r) => (
                <ReferenceLine
                  key={r.label}
                  y={r.value}
                  stroke="var(--ink-subtle)"
                  strokeDasharray="4 4"
                  label={{ value: r.label, fill: 'var(--ink-subtle)', fontSize: 11 }}
                />
              ))}
              {seriesKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId={stacked ? 'a' : undefined}
                  fill={SERIES[index % SERIES.length]}
                  radius={stacked ? 0 : [6, 6, 0, 0]}
                  maxBarSize={stacked ? 48 : 36}
                  cursor="pointer"
                  onClick={(data) => {
                    const payload = data as unknown as {
                      payload?: { x?: string }
                      x?: string
                    }
                    const x = String(payload.payload?.x ?? payload.x ?? '')
                    if (x) onMarkClick(x)
                  }}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <SourceLine freshness={freshness} tables={sourceTables} />
      {chart.methodologyId ? (
        <a className="methodology-link" href={`/methodology#${chart.methodologyId}`}>
          Methodology
        </a>
      ) : null}
      {showTable ? (
        <DetailTableView
          table={{
            id: `table-${chart.id}`,
            title: `${chart.title} (table)`,
            columns: [
              { key: 'x', label: chart.dimension },
              { key: 'y', label: chart.measure },
              { key: 'series', label: 'Series' },
            ],
            rows: chart.points.map((p) => ({
              x: String(p.x),
              y: p.y,
              series: p.series ?? null,
            })),
          }}
        />
      ) : null}
    </article>
  )
}

function ChartMenu({
  chart,
  onViewTable,
}: {
  chart: ChartPayload
  onViewTable: () => void
}) {
  return (
    <details className="chart-menu">
      <summary aria-label={`Export ${chart.title}`}>⋯</summary>
      <div className="chart-menu-panel" role="menu">
        <button type="button" role="menuitem" onClick={onViewTable}>
          View as table
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() =>
            downloadText(`${chart.id}.csv`, chartToCsv(chart), 'text/csv;charset=utf-8')
          }
        >
          Download CSV
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            const svg = document.querySelector(
              `[aria-label="${CSS.escape(chart.title)}"] svg`,
            )
            if (!svg) return
            const xml = new XMLSerializer().serializeToString(svg)
            const svgBlob = new Blob([xml], {
              type: 'image/svg+xml;charset=utf-8',
            })
            const url = URL.createObjectURL(svgBlob)
            const img = new Image()
            img.onload = () => {
              const canvas = document.createElement('canvas')
              canvas.width = img.width || 640
              canvas.height = img.height || 360
              const ctx = canvas.getContext('2d')
              if (!ctx) return
              ctx.fillStyle =
                getComputedStyle(document.body).getPropertyValue('--surface') ||
                '#fff'
              ctx.fillRect(0, 0, canvas.width, canvas.height)
              ctx.drawImage(img, 0, 0)
              canvas.toBlob((blob) => {
                if (!blob) return
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = `${chart.id}.png`
                a.click()
              })
              URL.revokeObjectURL(url)
            }
            img.src = url
          }}
        >
          Download PNG
        </button>
      </div>
    </details>
  )
}
