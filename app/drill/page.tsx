import Link from 'next/link'

const ENTITIES = [
  {
    slug: 'manager',
    title: 'Manager view',
    blurb: 'Day 3 destination. v0.1 placeholder so drill-through can navigate.',
  },
  {
    slug: 'function',
    title: 'Function detail',
    blurb: 'Scoped function cut. Full page ships with Dev 2 shell.',
  },
  {
    slug: 'employee',
    title: 'Employee 360',
    blurb: 'Day 3 destination. v0.1 placeholder for drill-through demos.',
  },
  {
    slug: 'requisition',
    title: 'Requisition detail',
    blurb: 'Req-scoped detail. Placeholder until recruiting drill-through lands.',
  },
] as const

export default function DrillThroughIndexPage() {
  return (
    <main className="admin-page">
      <header className="admin-header">
        <p className="eyebrow">Drill-through</p>
        <h1>Placeholder destinations</h1>
        <p className="lede">
          These routes exist so CAP-8 drill-through can be demonstrated before Day
          3 pages ship.
        </p>
      </header>
      <ul>
        {ENTITIES.map((entity) => (
          <li key={entity.slug}>
            <Link href={`/drill/${entity.slug}/example`}>{entity.title}</Link>
            <p>{entity.blurb}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}
