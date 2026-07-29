'use client'

import { useFilters, isDefaultFilters } from '@/components/shell/FilterProvider'

type DimKey = 'functions' | 'locations' | 'levelBands' | 'tenureBands'

const DIMS: { key: DimKey; label: string; metaKey: 'functions' | 'locations' | 'levelBands' | 'tenureBands' }[] = [
  { key: 'functions', label: 'Function', metaKey: 'functions' },
  { key: 'locations', label: 'Location', metaKey: 'locations' },
  { key: 'levelBands', label: 'Level band', metaKey: 'levelBands' },
  { key: 'tenureBands', label: 'Tenure band', metaKey: 'tenureBands' },
]

export function FilterBar() {
  const { filters, meta, setDimension, clearFilters, clearCrossFilter, drillUpTo } =
    useFilters()

  const dirty = !isDefaultFilters(filters)

  return (
    <div className="filter-bar" role="region" aria-label="Global filters">
      <span className="filter-label">Filters</span>
      {DIMS.map((dim) => {
        const selected = filters[dim.key]
        const options = meta?.[dim.metaKey] ?? []
        const label =
          selected.length === 0
            ? 'All'
            : selected.length === 1
              ? selected[0]
              : `${selected.length} selected`
        return (
          <label key={dim.key} className="filter-chip filter-select-wrap">
            <span>{dim.label}:</span>
            <strong>{label}</strong>
            <select
              className="filter-select"
              aria-label={dim.label}
              value={selected[0] ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setDimension(dim.key, v ? [v] : [])
              }}
            >
              <option value="">All</option>
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        )
      })}

      {filters.crossFilter && (
        <button
          type="button"
          className="filter-chip filter-chip-active"
          onClick={clearCrossFilter}
          title="Clear cross-filter"
        >
          Cross-filter: {filters.crossFilter.value} ×
        </button>
      )}

      {filters.drill && (
        <nav className="drill-breadcrumb" aria-label="Drill path">
          <button type="button" className="breadcrumb-crumb" onClick={() => drillUpTo(-1)}>
            All
          </button>
          {filters.drill.path.map((crumb, i) => (
            <span key={`${crumb}-${i}`} className="breadcrumb-item">
              <span aria-hidden="true">/</span>
              <button
                type="button"
                className="breadcrumb-crumb"
                onClick={() => drillUpTo(i)}
              >
                {crumb}
              </button>
            </span>
          ))}
        </nav>
      )}

      {dirty && (
        <button type="button" className="filter-clear" onClick={clearFilters}>
          Clear filters
        </button>
      )}
    </div>
  )
}
