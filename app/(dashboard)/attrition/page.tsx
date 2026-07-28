import { PagePlaceholder } from '@/components/shell/PagePlaceholder'

export default function AttritionPage() {
  return (
    <PagePlaceholder
      title="Attrition & Retention"
      intent="Voluntary, involuntary and regrettable shown as three separate numbers — never blended (PRD MET-3). Voluntary rate now vs. a year ago via period comparison."
      items={[
        'Three separate rates: voluntary · involuntary · regrettable',
        'Voluntary now vs. year-ago (comparison mode)',
        'By function, level, location and tenure band — sorted descending',
        'Stated reasons across 11 codes',
        'Tenure hazard curve',
        'Manager effect (subject to n ≥ 5)',
      ]}
    />
  )
}
