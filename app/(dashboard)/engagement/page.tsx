import { MetricsPageClient } from '@/components/shell/MetricsPageClient'

export default function EngagementPage() {
  return (
    <MetricsPageClient
      endpoint="/api/metrics/engagement"
      title="Engagement"
      sourceTables={[
        'engagement_responses',
        'engagement_questions',
        'engagement_open_ended',
        'employees',
      ]}
    />
  )
}
