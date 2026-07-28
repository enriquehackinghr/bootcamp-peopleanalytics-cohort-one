import { PagePlaceholder } from '@/components/shell/PagePlaceholder'

export default function WorkforcePage() {
  return (
    <PagePlaceholder
      title="Workforce"
      intent="Headcount and composition, IC/manager mix, span of control, monthly hires and terminations, tenure profile, org exploration via the declared hierarchy."
      items={[
        'Composition by function, level, location, work arrangement, tenure band',
        'IC / manager mix and span-of-control distribution incl. manager-debt cut',
        'Monthly hires, terminations, and net change',
        'Tenure profile with first-year population called out',
        'Org exploration: Function → Job Family → Career Level → Employee',
      ]}
    />
  )
}
