'use client'

import type { DetailTable } from '@/lib/types'

function downloadCsv(table: DetailTable) {
  const headers = table.columns.map((c) => c.label)
  const lines = [headers.join(',')]
  for (const row of table.rows) {
    lines.push(
      table.columns
        .map((c) => {
          const v = row[c.key]
          return `"${String(v ?? '').replace(/"/g, '""')}"`
        })
        .join(','),
    )
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${table.id}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function DetailTableView({ table }: { table: DetailTable }) {
  if (!table.rows.length) {
    return (
      <section className="detail-table-section" aria-label={table.title}>
        <div className="detail-table-header">
          <h3 className="card-title">{table.title}</h3>
        </div>
        <p className="card-subtitle">No rows match the current filters.</p>
      </section>
    )
  }

  return (
    <section className="detail-table-section" aria-label={table.title}>
      <div className="detail-table-header">
        <h3 className="card-title">{table.title}</h3>
        <button type="button" className="filter-clear" onClick={() => downloadCsv(table)}>
          Download CSV
        </button>
      </div>
      <div className="detail-table-scroll">
        <table className="detail-table">
          <thead>
            <tr>
              {table.columns.map((col) => (
                <th key={col.key} scope="col">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.slice(0, 200).map((row, i) => (
              <tr key={i}>
                {table.columns.map((col) => (
                  <td key={col.key}>{row[col.key] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.rows.length > 200 ? (
        <p className="admin-meta">Showing first 200 of {table.rows.length.toLocaleString()} rows.</p>
      ) : null}
    </section>
  )
}
