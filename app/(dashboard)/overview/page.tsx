import { PagePlaceholder } from '@/components/shell/PagePlaceholder'

const KPI = [
  { label: 'Active headcount', value: '820', delta: '', polarity: 'neutral' as const },
  { label: 'Voluntary attrition (TTM)', value: '8.9%', delta: '+0.4pp vs. prior', polarity: 'bad' as const },
  { label: 'Open requisitions', value: '36', delta: '+3 vs. prior', polarity: 'neutral' as const },
  { label: 'Engagement mean', value: '3.66', delta: '−0.05 vs. Q4', polarity: 'bad' as const },
  { label: 'Median compa-ratio', value: '1.00', delta: 'flat', polarity: 'neutral' as const },
  { label: 'Elevated flight risk', value: '42', delta: '+7 vs. prior', polarity: 'bad' as const },
]

export default function OverviewPage() {
  return (
    <>
      <section className="kpi-row" aria-label="Executive KPIs">
        {KPI.map((k) => (
          <article key={k.label} className="kpi-tile">
            <span className="kpi-label">{k.label}</span>
            <span className="kpi-value">{k.value}</span>
            {k.delta && (
              <span className="kpi-delta" data-polarity={k.polarity}>
                {k.delta}
              </span>
            )}
          </article>
        ))}
      </section>

      <PagePlaceholder
        title="Executive Overview grid — WS-5"
        intent="The six questions a CEO asks in a monthly business review. Reference model: meridian_ceo_people_dashboard.html. Every tile above is a mock; numbers wire to metrics.voluntary_attrition_rate() etc. once Developer 1's routes land."
        items={[
          'Headcount trend (line, 2px, direct-labeled ends)',
          'Composition by function (sorted horizontal bar — 14 categories)',
          'Attrition by type (stacked bar, 3 segments — never blended)',
          'Recruiting funnel (horizontal stage bars with conversion %)',
          'Engagement by category (horizontal bar with company-mean reference line)',
        ]}
      />
    </>
  )
}
