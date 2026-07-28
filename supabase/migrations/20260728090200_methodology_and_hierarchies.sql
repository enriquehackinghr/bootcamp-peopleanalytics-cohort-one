-- Hierarchy declarations readable by the UI (SEM-5)

create table if not exists metrics.hierarchy_declarations (
  id text primary key,
  label text not null,
  levels text[] not null
);

insert into metrics.hierarchy_declarations (id, label, levels) values
  ('org', 'Organization', array['function', 'job_family', 'career_level', 'employee']),
  ('geography', 'Geography', array['region', 'country', 'office', 'pay_zone']),
  ('time', 'Time', array['year', 'quarter', 'month'])
on conflict (id) do update
  set label = excluded.label,
      levels = excluded.levels;

grant select on metrics.hierarchy_declarations to meridian_app, meridian_wizard;

-- Methodology catalog (Section 5)
create table if not exists metrics.methodology_catalog (
  id text primary key,
  name text not null,
  definition text not null,
  source_tables text[] not null,
  notes text,
  reconciliation_target text
);

insert into metrics.methodology_catalog (
  id, name, definition, source_tables, notes, reconciliation_target
) values
  (
    'active_headcount',
    'Active headcount',
    'employment_status = Active, including employees on leave.',
    array['employees'],
    null,
    '820'
  ),
  (
    'voluntary_attrition_rate',
    'Voluntary attrition rate',
    'Voluntary terminations in the trailing twelve months divided by average active headcount; average = (start + end) / 2.',
    array['employees'],
    'Never blend with involuntary or regrettable.',
    '8.9% (73)'
  ),
  (
    'involuntary_attrition',
    'Involuntary attrition',
    'termination_type = Involuntary in the trailing twelve months. Reported separately, never blended.',
    array['employees'],
    null,
    '27'
  ),
  (
    'regrettable_attrition',
    'Regrettable attrition',
    'Voluntary terms where the last rating was Exceeded or Significantly Exceeded, or talent designation was Top Talent or Strong Performer.',
    array['employees', 'performance_reviews'],
    null,
    'derived'
  ),
  (
    'compa_ratio',
    'Compa-ratio',
    'base_salary / salary_range_mid. Aggregates do not apply FX conversion.',
    array['employees'],
    null,
    'median 1.00; 60 below 0.90'
  ),
  (
    'range_penetration',
    'Range penetration',
    '(base - min) / (max - min).',
    array['employees'],
    'ACI healthy band 60–80%.',
    'field exists'
  ),
  (
    'market_position',
    'Market position',
    'base_salary_usd / ACI P50 for mapped function × apex level × tier via level_map and pay_zone_map.',
    array['employees', 'level_map', 'pay_zone_map', 'fx_rates', 'market_benchmarks'],
    'MAP-1/2/3: never join Meridian pay_zone directly to ACI tier; convert salary to USD before aggregating.',
    'derived'
  ),
  (
    'engagement_survey',
    'Engagement — survey',
    'Mean of Likert items on a 1–5 scale from anonymous engagement_responses. Aggregate only.',
    array['engagement_responses', 'engagement_questions'],
    'Never share an axis with the per-employee instrument.',
    '3.66'
  ),
  (
    'engagement_per_employee',
    'Engagement — per employee',
    'latest_engagement_score on a 0–10 scale. Different instrument from the survey.',
    array['employees'],
    'Never share an axis with the survey mean.',
    'mean 7.33'
  ),
  (
    'open_requisitions',
    'Open requisitions',
    'outcome = Open. On Hold and Cancelled reported separately.',
    array['requisitions'],
    null,
    '36'
  ),
  (
    'time_to_fill',
    'Time to fill',
    'close_date - open_date for filled requisitions only. Target 60 days IC.',
    array['requisitions'],
    null,
    '60 baseline'
  ),
  (
    'first_offer_acceptance',
    'First-offer acceptance',
    'offers_accepted / offers_made for first offers.',
    array['offers', 'requisitions'],
    null,
    '87% baseline'
  ),
  (
    'span_of_control',
    'Span of control',
    'Average number_of_direct_reports where > 0. Manager debt = exactly one report.',
    array['employees'],
    null,
    '~115 managers'
  ),
  (
    'elevated_flight_risk',
    'Elevated flight risk',
    'flight_risk_rating = High — displayed field, not a computed score in v0.1.',
    array['employees'],
    null,
    '42'
  )
on conflict (id) do update
  set name = excluded.name,
      definition = excluded.definition,
      source_tables = excluded.source_tables,
      notes = excluded.notes,
      reconciliation_target = excluded.reconciliation_target;

grant select on metrics.methodology_catalog to meridian_app, meridian_wizard;
