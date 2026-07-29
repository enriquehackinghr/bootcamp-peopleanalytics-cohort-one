import { MetricsPageClient } from '@/components/shell/MetricsPageClient'

export default function WorkforcePage() {
  return (
    <MetricsPageClient
      endpoint="/api/metrics/workforce"
      title="Workforce"
      sourceTables={['employees']}
    />
  )
}
