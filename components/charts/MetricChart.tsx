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
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { useState } from 'react'
import type { ChartPayload, DataFreshness, ReferenceLine as RefSpec } from '@/lib/types'
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

/** Match a numeric reference to a categorical bucket like "1.0". */
function matchCategoryValue(value: number, categories: string[]): string | number {
  const exact = categories.find((c) => Number(c) === value || c === String(value))
  if (exact) return exact
  const oneDecimal = categories.find((c) => c === value.toFixed(1))
  if (oneDecimal) return oneDecimal
  return value
}

/**
 * Histograms put reference marks on the category (X) axis.
 * Horizontal bars put them on the value (X) axis.
 * Lines / vertical bars put measure references on Y.
 */
function referenceAxis(
  chart: ChartPayload,
  layout: 'horizontal' | 'vertical' | 'line',
): 'x' | 'y' {
  if (chart.form === 'histogram') return 'x'
  if (layout === 'horizontal') return 'x'
  return 'y'
}

function ReferenceLabel({
  viewBox,
  value,
  orientation,
}: {
  viewBox?: { x?: number; y?: number; width?: number; height?: number }
  value?: string
  orientation: 'vertical' | 'horizontal'
}) {
  if (!viewBox || !value) return null
  const x = viewBox.x ?? 0
  const y = viewBox.y ?? 0
  const width = viewBox.width ?? 0

  // Keep labels in the clear margin beside/above the mark — never on the axis ticks
  // and never centered on top of a dense bar.
  if (orientation === 'vertical') {
    return (
      <text
        x={x + 8}
        y={y + 14}
        fill="var(--ink)"
        stroke="var(--surface)"
        strokeWidth={4}
        paintOrder="stroke"
        fontSize={11}
        fontWeight={600}
        textAnchor="start"
      >
        <title>{value}</title>
        {value}
      </text>
    )
  }

  return (
    <text
      x={x + width - 8}
      y={y - 6}
      fill="var(--ink)"
      stroke="var(--surface)"
      strokeWidth={4}
      paintOrder="stroke"
      fontSize={11}
      fontWeight={600}
      textAnchor="end"
    >
      <title>{value}</title>
      {value}
    </text>
  )
}

function ChartReferences({
  chart,
  categories,
  layout,
}: {
  chart: ChartPayload
  categories: string[]
  layout: 'horizontal' | 'vertical' | 'line'
}) {
  const axis = referenceAxis(chart, layout)
  return (
    <>
      {(chart.referenceLines ?? []).map((r: RefSpec) => {
        const orientation = axis === 'x' ? 'vertical' : 'horizontal'
        const props =
          axis === 'x'
            ? {
                x:
                  chart.form === 'histogram'
                    ? matchCategoryValue(r.value, categories)
                    : r.value,
              }
            : { y: r.value }

        return (
          <ReferenceLine
            key={`${r.label}-${r.value}`}
            {...props}
            stroke="var(--meridian, var(--ink-subtle))"
            strokeDasharray="4 4"
            strokeWidth={1.25}
            ifOverflow="extendDomain"
            label={(labelProps) => (
              <ReferenceLabel
                {...labelProps}
                value={r.label}
                orientation={orientation}
              />
            )}
          />
        )
      })}
    </>
  )
}

/** Custom Y-axis tick so long category names stay readable and never get dropped. */
function CategoryTick({
  x = 0,
  y = 0,
  payload,
  width = 110,
}: {
  x?: string | number
  y?: string | number
  payload?: { value?: string | number }
  width?: number
}) {
  const raw = String(payload?.value ?? '')
  const maxChars = Math.max(10, Math.floor(width / 7))
  const label = raw.length > maxChars ? `${raw.slice(0, maxChars - 1)}…` : raw

  return (
    <text
      x={Number(x)}
      y={Number(y)}
      dy={4}
      textAnchor="end"
      fill="var(--ink-muted)"
      fontSize={11}
    >
      <title>{raw}</title>
      {label}
    </text>
  )
}

function AxisTick({
  x = 0,
  y = 0,
  payload,
  angle = 0,
  maxChars = 18,
}: {
  x?: string | number
  y?: string | number
  payload?: { value?: string | number }
  angle?: number
  maxChars?: number
}) {
  const raw = String(payload?.value ?? '')
  const label = raw.length > maxChars ? `${raw.slice(0, maxChars - 1)}…` : raw
  const anchor = angle ? 'end' : 'middle'

  return (
    <g transform={`translate(${Number(x)},${Number(y)})`}>
      <text
        dy={angle ? 4 : 12}
        dx={angle ? -2 : 0}
        textAnchor={anchor}
        transform={angle ? `rotate(${angle})` : undefined}
        fill="var(--ink-subtle)"
        fontSize={11}
      >
        <title>{raw}</title>
        {label}
      </text>
    </g>
  )
}

function ValueLabel(props: {
  x?: number
  y?: number
  width?: number
  height?: number
  value?: number | string
}) {
  const { x = 0, y = 0, width = 0, height = 0, value } = props
  if (value === undefined || value === null || value === '') return null
  // Skip labels on tiny bars so they don't collide with neighbors/axes.
  if (typeof value === 'number' && width < 28 && height < 14) return null

  return (
    <text
      x={x + width + 6}
      y={y + height / 2}
      dy={4}
      fill="var(--ink-muted)"
      fontSize={11}
      textAnchor="start"
    >
      {value}
    </text>
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
  const isScatter = chart.form === 'scatter'
  const isHeatmap = chart.form === 'heatmap'
  const isHistogram = chart.form === 'histogram'
  const seriesKeys = chart.seriesKeys?.length
    ? chart.seriesKeys
    : stacked
      ? [...new Set(chart.points.map((p) => p.series).filter(Boolean) as string[])]
      : ['y']

  const categoryLabels = rows.map((row) => String(row.x))
  const longestCategory = categoryLabels.reduce(
    (max, label) => Math.max(max, label.length),
    0,
  )
  const denseCategories = categoryLabels.length > 6
  const longCategories = longestCategory > 8 || denseCategories
  const angleX = longCategories ? -32 : 0
  const xAxisHeight = angleX ? Math.min(72, 28 + longestCategory * 1.8) : 28
  const bottomMargin = angleX ? xAxisHeight + 8 : chart.referenceLines?.length ? 20 : 8
  const topMargin = chart.referenceLines?.length ? 28 : 12

  const yAxisWidth = horizontal
    ? Math.min(200, Math.max(96, Math.ceil(longestCategory * 7.2)))
    : 48
  const horizontalFrameHeight = horizontal
    ? Math.max(260, rows.length * 34 + 48)
    : undefined

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
      <div
        className="chart-frame"
        tabIndex={0}
        aria-label={chart.title}
        style={horizontalFrameHeight ? { height: horizontalFrameHeight } : undefined}
      >
        <ResponsiveContainer width="100%" height="100%">
          {isScatter ? (
            <ScatterChart margin={{ top: 12, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="x"
                name={chart.dimension}
                tick={{ fill: 'var(--ink-subtle)', fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={chart.measure}
                tick={{ fill: 'var(--ink-subtle)', fontSize: 11 }}
              />
              <ZAxis range={[40, 40]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<RichTooltip />} />
              <Scatter
                data={chart.points.map((p) => ({
                  x: Number(p.x),
                  y: p.y,
                  name: p.label ?? String(p.x),
                }))}
                fill={SERIES[0]}
              />
            </ScatterChart>
          ) : isHeatmap ? (
            <BarChart
              data={chart.points.map((p) => ({
                x: String(p.x),
                y: p.y,
                series: p.series ?? 'value',
              }))}
              margin={{ top: topMargin, right: 12, left: 0, bottom: bottomMargin }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="x"
                interval={0}
                height={xAxisHeight}
                tick={(props) => (
                  <AxisTick {...props} angle={angleX} maxChars={denseCategories ? 10 : 16} />
                )}
              />
              <YAxis tick={{ fill: 'var(--ink-subtle)', fontSize: 11 }} width={44} />
              <Tooltip content={<RichTooltip />} />
              <Bar dataKey="y" maxBarSize={36}>
                {chart.points.map((p, index) => {
                  const max = Math.max(...chart.points.map((pt) => pt.y), 1)
                  const intensity = p.y / max
                  return (
                    <Cell
                      key={index}
                      fill={SERIES[0]}
                      fillOpacity={0.25 + intensity * 0.75}
                    />
                  )
                })}
              </Bar>
            </BarChart>
          ) : isLine ? (
            <LineChart
              data={rows}
              margin={{ top: topMargin, right: 16, left: 0, bottom: bottomMargin }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="x"
                interval="preserveStartEnd"
                minTickGap={12}
                height={xAxisHeight}
                tick={(props) => (
                  <AxisTick {...props} angle={angleX} maxChars={denseCategories ? 10 : 14} />
                )}
              />
              <YAxis tick={{ fill: 'var(--ink-subtle)', fontSize: 11 }} width={44} />
              <Tooltip content={<RichTooltip />} />
              <ChartReferences chart={chart} categories={categoryLabels} layout="line" />
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
              margin={{
                top: chart.referenceLines?.length ? 18 : 8,
                right: 44,
                left: 4,
                bottom: 8,
              }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fill: 'var(--ink-subtle)', fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="x"
                width={yAxisWidth}
                interval={0}
                tick={(props) => <CategoryTick {...props} width={yAxisWidth} />}
              />
              <Tooltip content={<RichTooltip />} />
              <ChartReferences
                chart={chart}
                categories={categoryLabels}
                layout="horizontal"
              />
              <Bar
                dataKey="y"
                radius={[0, 2, 2, 0]}
                maxBarSize={22}
                cursor="pointer"
                onClick={(data) => {
                  const payload = data as unknown as {
                    payload?: { x?: string }
                    x?: string
                  }
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
                <LabelList dataKey="y" content={<ValueLabel />} />
              </Bar>
            </BarChart>
          ) : (
            <BarChart
              data={rows}
              margin={{ top: topMargin, right: 12, left: 0, bottom: bottomMargin }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="x"
                interval={0}
                height={xAxisHeight}
                tick={(props) => (
                  <AxisTick
                    {...props}
                    angle={isHistogram ? 0 : angleX}
                    maxChars={isHistogram ? 6 : denseCategories ? 10 : 16}
                  />
                )}
              />
              <YAxis tick={{ fill: 'var(--ink-subtle)', fontSize: 11 }} width={44} />
              <Tooltip content={<RichTooltip />} />
              <ChartReferences
                chart={chart}
                categories={categoryLabels}
                layout="vertical"
              />
              {seriesKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId={stacked ? 'a' : undefined}
                  fill={SERIES[index % SERIES.length]}
                  radius={stacked ? 0 : [2, 2, 0, 0]}
                  maxBarSize={stacked ? 48 : isHistogram ? 42 : 36}
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
