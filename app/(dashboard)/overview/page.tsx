import { MetricsPageClient } from '@/components/shell/MetricsPageClient'

export default function OverviewPage() {
  return (
    <MetricsPageClient
      endpoint="/api/metrics/executive"
      title="Executive Overview"
      sourceTables={['employees']}
    />
  )
}
