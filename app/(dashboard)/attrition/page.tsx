import { MetricsPageClient } from '@/components/shell/MetricsPageClient'

export default function AttritionPage() {
  return (
    <MetricsPageClient
      endpoint="/api/metrics/attrition"
      title="Attrition & Retention"
      sourceTables={['employees']}
    />
  )
}
