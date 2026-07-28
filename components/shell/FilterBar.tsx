'use client'

// v0.1 placeholder — WS-1 will replace with a real FilterProvider + URL serialization.
const FILTERS = [
  { label: 'Function', value: 'All' },
  { label: 'Location', value: 'All' },
  { label: 'Level band', value: 'All' },
  { label: 'Tenure band', value: 'All' },
]

export function FilterBar() {
  return (
    <div className="filter-bar" role="region" aria-label="Global filters">
      <span className="filter-label">Filters</span>
      {FILTERS.map((f) => (
        <button
          key={f.label}
          type="button"
          className="filter-chip"
          data-set={f.value !== 'All'}
        >
          <span>{f.label}:</span>
          <strong>{f.value}</strong>
          <span aria-hidden="true">▾</span>
        </button>
      ))}
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-subtle)' }}>
        Wired in WS-1 · will serialize to URL
      </span>
    </div>
  )
}
