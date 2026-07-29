import { MetricsPageClient } from '@/components/shell/MetricsPageClient'

export default function RecruitingPage() {
  return (
    <MetricsPageClient
      endpoint="/api/metrics/recruiting"
      title="Recruiting"
      sourceTables={[
        'requisitions',
        'funnel_events',
        'offers',
        'application_sources',
        'recruiters',
      ]}
    />
  )
}
