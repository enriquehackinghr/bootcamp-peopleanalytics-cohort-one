import { PagePlaceholder } from '@/components/shell/PagePlaceholder'

export default function CompensationPage() {
  return (
    <PagePlaceholder
      title="Compensation"
      intent="Compa-ratio distribution, range penetration, market position via the three mapping tables (level_map, pay_zone_map, fx_rates). Any measure that sums raw salary converts to USD first (MAP-2)."
      items={[
        'Compa-ratio histogram diverging around 1.00; count below 0.90 called out',
        'Range penetration with the ACI 60–80% healthy band as a benchmark band',
        'Pay position by function, level and location — via mapping tables',
        'Pay vs. market as a scatter (≤3 series, per §10.10)',
        'Equity mix and compression',
        'Pay equity within job × level × zone with min cell size enforced',
      ]}
    />
  )
}
