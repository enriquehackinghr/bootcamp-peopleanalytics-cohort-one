import { PagePlaceholder } from '@/components/shell/PagePlaceholder'

export default function EngagementPage() {
  return (
    <PagePlaceholder
      title="Engagement"
      intent="Score by 10 categories with company-mean reference line. Anonymity is structural — engagement_responses has no employee key; aggregate only, min cell size enforced in the view layer."
      items={[
        'Score by 10 categories with change vs. Q4 2025',
        'Cohort cuts — the cohorts furthest below the company mean surfaced',
        'Drivers',
        'Open-ended theme frequency (from 886 responses)',
        'The two engagement instruments are never on a shared axis (MET-2)',
      ]}
    />
  )
}
