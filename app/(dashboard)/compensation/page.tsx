import { MetricsPageClient } from '@/components/shell/MetricsPageClient'

export default function CompensationPage() {
  return (
    <MetricsPageClient
      endpoint="/api/metrics/compensation"
      title="Compensation"
      sourceTables={['employees', 'compensation_events']}
    />
  )
}
