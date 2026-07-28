import Link from 'next/link'

interface PageProps {
  params: Promise<{ entity: string; id: string }>
}

const LABELS: Record<string, string> = {
  manager: 'Manager view',
  function: 'Function detail',
  employee: 'Employee 360',
  requisition: 'Requisition detail',
}

export default async function DrillThroughPlaceholderPage({ params }: PageProps) {
  const { entity, id } = await params
  const title = LABELS[entity] ?? 'Drill-through'

  return (
    <main className="admin-page">
      <header className="admin-header">
        <p className="eyebrow">Drill-through placeholder</p>
        <h1>{title}</h1>
        <p className="lede">
          Entity <code>{entity}</code> · id <code>{id}</code>. Full experience
          ships on Day 3; this route preserves filter context in the URL for
          Dev 2 wiring.
        </p>
      </header>
      <p>
        <Link href="/">Back to home</Link>
        {' · '}
        <Link href="/admin/upload">Admin upload</Link>
        {' · '}
        <Link href="/drill">All placeholders</Link>
      </p>
    </main>
  )
}
