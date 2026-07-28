import { PagePlaceholder } from '@/components/shell/PagePlaceholder'

export default function MethodologyPage() {
  return (
    <PagePlaceholder
      title="Methodology"
      intent="Every §5 definition, its source table, and responsible-use language. Reachable from beside every number in the product (MET-1). States the two engagement instruments' different scales, and the three mapping-table caveats."
      items={[
        'Voluntary attrition rate — voluntary terms TTM ÷ average active headcount',
        'Regrettable attrition — voluntary + last rating ≥ Exceeded or Top/Strong talent',
        'Compa-ratio · Range penetration · Market position (via mapping tables)',
        'Engagement — survey (1–5) vs. per-employee (0–10), never averaged (MET-2)',
        'Time to fill · First-offer acceptance · Elevated flight risk',
      ]}
    />
  )
}
