import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ entity: string; id: string }>
}

/** Class 2 drill placeholders resolve to Class 3 limited routes. */
export default async function DrillThroughPage({ params }: PageProps) {
  const { entity, id } = await params
  if (entity === 'manager') redirect(`/managers/${id}`)
  if (entity === 'employee') redirect(`/employees/${id}`)
  redirect(`/advanced-analytics`)
}
