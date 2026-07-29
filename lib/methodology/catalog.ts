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

  // -------------------------------------------------------------------------
  // Class 3 — advanced analytics, risk, and talent
  // -------------------------------------------------------------------------
  {
    id: 'tenure_hazard',
    name: 'Tenure hazard rate',
    definition:
      'Discrete-time hazard: exits in tenure month t ÷ employees who survived to the start of month t. Months where the surviving cohort is below the minimum cohort size (10) are withheld.',
    sourceTables: ['employee_snapshots', 'termination_history'],
    notes: 'Describes when exit risk concentrates across tenure, not why.',
  },
  {
    id: 'cohort_survival',
    name: 'Cohort survival curve',
    definition:
      'Share of each hire-month cohort still active at N months since hire, computed from the product of (1 − hazard) across prior months. Cohorts below the minimum cohort size (10) are withheld.',
    sourceTables: ['employee_snapshots', 'termination_history'],
  },
  {
    id: 'attrition_risk',
    name: 'Attrition risk score',
    definition:
      'Weighted composite (risk-v0.2) of tenure stage, compa-ratio band, engagement trend, manager-change recency, promotion gap, and rating trend, scored 0–100 and grouped into low / moderate / elevated / high bands.',
    sourceTables: [
      'employee_snapshots',
      'termination_history',
      'engagement_score_history',
      'org_events',
    ],
    notes:
      'An association with historical voluntary exits, not a prediction about any named individual. See risk-v0.2 methodology note for validation status.',
  },
  {
    id: 'risk-v0.2',
    name: 'Risk model version — risk-v0.2',
    definition:
      'Current production version of the attrition risk score. Factor weights and band thresholds are fixed for the version; backtest lift and precision/recall at k are reported alongside every score to show current validation performance.',
    sourceTables: ['employee_snapshots', 'termination_history'],
    notes:
      'Model outputs are decision-support signals for prioritizing human conversations, never an automated basis for an employment action.',
  },
  {
    id: 'manager_effectiveness',
    name: 'Manager effectiveness',
    definition:
      'Composite score combining team voluntary attrition rate, team engagement mean, and span of control for managers with at least the minimum team size (5).',
    sourceTables: ['employee_snapshots', 'termination_history', 'engagement_score_history'],
    notes: 'A team-outcome composite, not an individual performance rating.',
  },
  {
    id: 'promotion_readiness',
    name: 'Promotion readiness',
    definition:
      'Latest manager/calibration-asserted readiness band (e.g. Ready now, Ready 1–2 yrs, Not yet) per employee.',
    sourceTables: ['employee_snapshots'],
  },
  {
    id: 'succession_bench',
    name: 'Succession bench coverage',
    definition:
      'Count of employees flagged "ready now" per critical role or function, expressed as a ratio against a coverage target of 1.',
    sourceTables: ['employee_snapshots'],
  },
  {
    id: 'exit_themes',
    name: 'Exit interview themes & drivers',
    definition:
      'Primary/secondary driver codes and coded open-text themes from exit_interviews, aggregated at or above the minimum cell size (5).',
    sourceTables: ['exit_interviews'],
    notes: 'Reflects only employees who completed an exit interview — not the full leaver population.',
  },
  {
    id: 'regrettable_dual',
    name: 'Regrettable attrition — dual definition',
    definition:
      'Narrow: voluntary terms with talent_designation = Top Talent. Broad: voluntary terms with talent_designation in (Top Talent, Strong Performer) or last_perf_rating in (Exceeded, Significantly Exceeded). Reported side by side, never blended into one number.',
    sourceTables: ['termination_history'],
  },
  {
    id: 'org_event_attrition',
    name: 'Attrition around org events',
    definition:
      'Exit or retention rate in fixed windows (e.g. −3/+3 months) around a manager change, reorg, or location/work-arrangement change recorded in org_events. Windows below the minimum cell size (5) are withheld.',
    sourceTables: ['org_events', 'termination_history', 'employee_snapshots'],
    notes: 'A rate change after the event is associated with the event, not proven to be caused by it.',
  },
  {
    id: 'exit_rate_by_compa_band',
    name: 'Exit rate by compa-ratio band',
    definition: 'Voluntary exit rate for employees grouped into compa-ratio bands.',
    sourceTables: ['employee_snapshots', 'termination_history'],
  },
  {
    id: 'exit_rate_by_engagement_band',
    name: 'Exit rate by engagement band',
    definition: 'Voluntary exit rate for employees grouped into engagement-score bands.',
    sourceTables: ['employee_snapshots', 'engagement_score_history', 'termination_history'],
  },
  {
    id: 'exit_rate_by_mobility_gap',
    name: 'Exit rate by internal-mobility gap',
    definition:
      'Voluntary exit rate for employees grouped by months-since-last-promotion band.',
    sourceTables: ['employee_snapshots', 'termination_history'],
  },
  {
    id: 'exit_rate_by_tenure_band',
    name: 'Exit rate by tenure band',
    definition: 'Voluntary exit rate for employees grouped into tenure bands.',
    sourceTables: ['employee_snapshots', 'termination_history'],
  },
  {
    id: 'nine_box_migration',
    name: 'Nine-box migration',
    definition:
      'Count of employees moving from one nine-box placement to another between the two most recent calibration cycles.',
    sourceTables: ['employee_snapshots'],
  },
  {
    id: 'rating_distribution',
    name: 'Performance rating distribution',
    definition: 'Headcount by latest performance rating for the filtered population.',
    sourceTables: ['employee_snapshots'],
  },
]
