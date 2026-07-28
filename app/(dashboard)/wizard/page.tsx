import { PagePlaceholder } from '@/components/shell/PagePlaceholder'

export default function WizardPage() {
  return (
    <PagePlaceholder
      title="Wizard"
      intent="Conversational analyst over the Meridian semantic layer. Cites the measures and tables it drew on. Inherits the active filter context by default. Owned by Developer 1; the chart renderer that draws its output is owned by Developer 2 and reuses the shared chart library — no second charting system (WIZ-5)."
      items={[
        'Right-hand panel available from every page + this destination page',
        'WizardChartSpec contract in lib/types.ts (WIZ-4)',
        'Read-only Supabase role, view-only, row/timeout caps (WIZ query safety)',
      ]}
    />
  )
}
