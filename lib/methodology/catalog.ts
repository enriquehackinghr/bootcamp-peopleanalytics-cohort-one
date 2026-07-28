/**
 * Static methodology fallback when metrics.methodology_catalog is empty / unavailable.
 */
import type { MethodologyEntry } from '@/lib/types'

export const METHODOLOGY_FALLBACK: MethodologyEntry[] = [
  {
    id: 'active_headcount',
    name: 'Active headcount',
    definition:
      "employment_status = Active, including employees on leave.",
    sourceTables: ['employees'],
    reconciliationTarget: '820',
  },
  {
    id: 'voluntary_attrition_rate',
    name: 'Voluntary attrition rate',
    definition:
      'Voluntary terminations TTM ÷ average active headcount; average = (start + end) / 2.',
    sourceTables: ['employees'],
    notes: 'Never blend with involuntary or regrettable.',
    reconciliationTarget: '8.9% (73)',
  },
  {
    id: 'involuntary_attrition',
    name: 'Involuntary attrition',
    definition:
      "termination_type = Involuntary. Reported separately, never blended.",
    sourceTables: ['employees'],
    reconciliationTarget: '27',
  },
  {
    id: 'regrettable_attrition',
    name: 'Regrettable attrition',
    definition:
      'Voluntary terms where the last rating was Exceeded or Significantly Exceeded, or talent designation was Top Talent or Strong Performer.',
    sourceTables: ['employees', 'performance_reviews'],
    reconciliationTarget: 'derived',
  },
  {
    id: 'compa_ratio',
    name: 'Compa-ratio',
    definition: 'base_salary / salary_range_mid.',
    sourceTables: ['employees'],
    reconciliationTarget: 'median 1.00; 60 below 0.90',
  },
  {
    id: 'range_penetration',
    name: 'Range penetration',
    definition: '(base − min) / (max − min).',
    sourceTables: ['employees'],
    notes: 'ACI healthy band 60–80%.',
  },
  {
    id: 'market_position',
    name: 'Market position',
    definition:
      'base_salary_usd / ACI P50 for mapped function × apex level × tier via level_map and pay_zone_map.',
    sourceTables: [
      'employees',
      'level_map',
      'pay_zone_map',
      'fx_rates',
      'market_benchmarks',
    ],
  },
  {
    id: 'engagement_survey',
    name: 'Engagement — survey',
    definition:
      'Mean of Likert items on a 1–5 scale from anonymous engagement_responses.',
    sourceTables: ['engagement_responses', 'engagement_questions'],
    notes: 'Never share an axis with the per-employee instrument.',
    reconciliationTarget: '3.66',
  },
  {
    id: 'engagement_per_employee',
    name: 'Engagement — per employee',
    definition:
      'latest_engagement_score on a 0–10 scale. Different instrument from the survey.',
    sourceTables: ['employees'],
    reconciliationTarget: 'mean 7.33',
  },
  {
    id: 'open_requisitions',
    name: 'Open requisitions',
    definition: "outcome = Open. On Hold and Cancelled reported separately.",
    sourceTables: ['requisitions'],
    reconciliationTarget: '36',
  },
  {
    id: 'time_to_fill',
    name: 'Time to fill',
    definition: 'close_date − open_date for filled requisitions only. Target 60 days IC.',
    sourceTables: ['requisitions'],
  },
  {
    id: 'first_offer_acceptance',
    name: 'First-offer acceptance',
    definition: 'offers_accepted / offers_made for first offers.',
    sourceTables: ['offers', 'requisitions'],
  },
  {
    id: 'span_of_control',
    name: 'Span of control',
    definition:
      'Average number_of_direct_reports where > 0. Manager debt = exactly one report.',
    sourceTables: ['employees'],
  },
  {
    id: 'elevated_flight_risk',
    name: 'Elevated flight risk',
    definition:
      "flight_risk_rating = High — displayed field, not a computed score in v0.1.",
    sourceTables: ['employees'],
    reconciliationTarget: '42',
  },
]
