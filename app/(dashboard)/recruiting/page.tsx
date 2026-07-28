import { PagePlaceholder } from '@/components/shell/PagePlaceholder'

export default function RecruitingPage() {
  return (
    <PagePlaceholder
      title="Recruiting"
      intent="Six-stage funnel drawn as horizontal stage bars with conversion % between stages — never a trapezoid (PRD §10.11). Time-to-fill vs. the 60-day target."
      items={[
        'Six stages: Application → Recruiter Screen → HM Screen → Onsite → Offer → Hire',
        'Time-to-fill by function × level vs. the 60-day target reference line',
        'Open req aging; On Hold (22) and Cancelled (31) reported separately from Open (36)',
        'Offer outcomes, first-offer acceptance, decline reasons',
        'Hires by source: Referral, LinkedIn in/out, Careers page, Agency, Job board, Event',
        'Recruiter productivity',
      ]}
    />
  )
}
