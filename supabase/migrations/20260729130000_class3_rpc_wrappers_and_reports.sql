-- Class 3: public RPC wrappers for the new metrics.* functions (PostgREST
-- surface, same pattern as 20260728090300 / 20260729031000) + customized
-- reporting tables + Class 3 methodology catalog entries.

-- ---------------------------------------------------------------------------
-- Public wrappers — attrition & retention drivers
-- ---------------------------------------------------------------------------

create or replace function public.c3_voluntary_attrition_rate(filters jsonb default '{}'::jsonb)
returns numeric language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_voluntary_attrition_rate(filters) $$;

create or replace function public.c3_involuntary_attrition_rate(filters jsonb default '{}'::jsonb)
returns numeric language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_involuntary_attrition_rate(filters) $$;

create or replace function public.c3_regrettable_attrition(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_regrettable_attrition(filters) $$;

create or replace function public.c3_attrition_by_cut(filters jsonb default '{}'::jsonb, cut text default 'function')
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_attrition_by_cut(filters, cut) $$;

create or replace function public.c3_tenure_hazard(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_tenure_hazard(filters) $$;

create or replace function public.c3_cohort_survival(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_cohort_survival(filters) $$;

create or replace function public.c3_exit_rate_by_compa_band(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_exit_rate_by_compa_band(filters) $$;

create or replace function public.c3_exit_rate_by_engagement_band(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_exit_rate_by_engagement_band(filters) $$;

create or replace function public.c3_exit_rate_by_mobility_gap(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_exit_rate_by_mobility_gap(filters) $$;

create or replace function public.c3_exit_rate_by_tenure_band(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_exit_rate_by_tenure_band(filters) $$;

create or replace function public.c3_attrition_around_manager_change(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_attrition_around_manager_change(filters) $$;

create or replace function public.c3_attrition_after_reorg(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_attrition_after_reorg(filters) $$;

create or replace function public.c3_retention_after_location_change(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_retention_after_location_change(filters) $$;

create or replace function public.c3_exit_driver_frequency(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_exit_driver_frequency(filters) $$;

create or replace function public.c3_exit_themes(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_exit_themes(filters) $$;

-- ---------------------------------------------------------------------------
-- Public wrappers — attrition risk (risk-v0.2)
-- ---------------------------------------------------------------------------

create or replace function public.attrition_risk_score(p_employee_id text, p_as_of date default null)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.attrition_risk_score(p_employee_id, p_as_of) $$;

create or replace function public.c3_risk_band_distribution(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_risk_band_distribution(filters) $$;

create or replace function public.c3_risk_factor_contribution(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_risk_factor_contribution(filters) $$;

create or replace function public.c3_risk_backtest()
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_risk_backtest() $$;

create or replace function public.c3_elevated_risk_headcount(filters jsonb default '{}'::jsonb)
returns bigint language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_elevated_risk_headcount(filters) $$;

-- ---------------------------------------------------------------------------
-- Public wrappers — manager effectiveness & talent
-- ---------------------------------------------------------------------------

create or replace function public.c3_manager_effectiveness(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_manager_effectiveness(filters) $$;

create or replace function public.c3_managers_below_median_count(filters jsonb default '{}'::jsonb)
returns bigint language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_managers_below_median_count(filters) $$;

create or replace function public.c3_rating_distribution(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_rating_distribution(filters) $$;

create or replace function public.c3_nine_box_migration(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_nine_box_migration(filters) $$;

create or replace function public.c3_promotion_pipeline(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_promotion_pipeline(filters) $$;

create or replace function public.c3_readiness_distribution(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_readiness_distribution(filters) $$;

create or replace function public.c3_bench_coverage(filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_bench_coverage(filters) $$;

create or replace function public.c3_manager_detail(p_manager_id text, filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_manager_detail(p_manager_id, filters) $$;

create or replace function public.c3_employee_360(p_employee_id text)
returns jsonb language sql stable security definer set search_path = public, metrics
as $$ select metrics.c3_employee_360(p_employee_id) $$;

grant execute on all functions in schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Customized reports: definitions + visuals + versions + access
-- Reports store a jsonb *definition* (layout / filters / visual references),
-- never raw datasets — visuals are re-derived from the semantic layer at
-- render time so exports always reconcile with the same methodology.
-- ---------------------------------------------------------------------------

create table if not exists public.customized_reports (
  report_id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner text,
  status text not null default 'draft',
  definition jsonb not null default '{}'::jsonb,
  data_load_id uuid references public.data_loads (id),
  semantic_model_version text,
  risk_methodology_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customized_report_visuals (
  visual_id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.customized_reports (report_id) on delete cascade,
  visual_type text not null,
  title text,
  config jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  methodology_id text
);

create table if not exists public.customized_report_versions (
  version_id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.customized_reports (report_id) on delete cascade,
  version_number int not null,
  definition jsonb not null,
  created_at timestamptz not null default now(),
  created_by text,
  change_note text,
  unique (report_id, version_number)
);

create table if not exists public.customized_report_access (
  report_id uuid not null references public.customized_reports (report_id) on delete cascade,
  principal text not null,
  access_level text not null default 'viewer',
  granted_at timestamptz not null default now(),
  primary key (report_id, principal)
);

create index if not exists customized_report_visuals_report_id_idx on public.customized_report_visuals (report_id);
create index if not exists customized_report_versions_report_id_idx on public.customized_report_versions (report_id);
create index if not exists customized_report_access_report_id_idx on public.customized_report_access (report_id);

create or replace function public.touch_customized_reports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists customized_reports_touch_updated_at on public.customized_reports;
create trigger customized_reports_touch_updated_at
  before update on public.customized_reports
  for each row execute function public.touch_customized_reports_updated_at();

-- Bootcamp environment: open read for anon/authenticated, full CRUD reserved
-- for service_role (the app talks to Supabase through the service role).
grant select on public.customized_reports to anon, authenticated, service_role;
grant select on public.customized_report_visuals to anon, authenticated, service_role;
grant select on public.customized_report_versions to anon, authenticated, service_role;
grant select on public.customized_report_access to anon, authenticated, service_role;

grant insert, update, delete on public.customized_reports to service_role;
grant insert, update, delete on public.customized_report_visuals to service_role;
grant insert, update, delete on public.customized_report_versions to service_role;
grant insert, update, delete on public.customized_report_access to service_role;

-- ---------------------------------------------------------------------------
-- Methodology catalog entries for Class 3 measures
-- ---------------------------------------------------------------------------

insert into metrics.methodology_catalog (
  id, name, definition, source_tables, notes, reconciliation_target
) values
  (
    'c3_voluntary_attrition_rate',
    'Voluntary attrition rate (Class 3)',
    'Voluntary terminations from termination_history in the trailing twelve months divided by average active headcount from employee_snapshots at the window start/end.',
    array['termination_history', 'employee_snapshots'],
    'Snapshot-sourced sibling of metrics.voluntary_attrition_rate; never blend with involuntary or regrettable.',
    'derived'
  ),
  (
    'c3_involuntary_attrition_rate',
    'Involuntary attrition rate (Class 3)',
    'Involuntary terminations from termination_history in the trailing twelve months divided by average active headcount from employee_snapshots.',
    array['termination_history', 'employee_snapshots'],
    'Reported separately, never blended.',
    'derived'
  ),
  (
    'c3_regrettable_attrition',
    'Regrettable attrition (derived vs. stated)',
    'Compares a derived proxy (voluntary exits with a top performance rating or talent designation) against the exit-interview-stated regrettable flag, plus their agreement rate.',
    array['termination_history', 'exit_interviews'],
    'Two measurement approaches shown side-by-side by design — association, not a single blended number.',
    'derived'
  ),
  (
    'c3_attrition_by_cut',
    'Voluntary attrition by cut',
    'Trailing-twelve-month voluntary exits divided by active headcount, grouped by function, level, location, tenure band, or work arrangement.',
    array['termination_history', 'employee_snapshots'],
    'Cells with headcount below the minimum cell size (5) are suppressed.',
    'derived'
  ),
  (
    'c3_tenure_hazard',
    'Tenure hazard curve (empirical)',
    'Trailing-twelve-month voluntary exit rate observed within each tenure-in-months band, exposure from the latest snapshot.',
    array['employee_snapshots', 'termination_history'],
    'Empirical association curve, not a fitted survival model. Bands with fewer than 10 exposed employees are suppressed.',
    'derived'
  ),
  (
    'c3_cohort_survival',
    'Cohort survival by hire year',
    'Share of each hire-year cohort still active (or exited on/after the milestone) at 12/24/36 months, from snapshots and termination_history.',
    array['employee_snapshots', 'termination_history'],
    'Milestones are null until the entire cohort year could possibly have reached them.',
    'derived'
  ),
  (
    'c3_retention_drivers',
    'Retention drivers (compa / engagement / mobility gap / tenure)',
    'Voluntary exit rate by band (compa-ratio, engagement score, months since promotion, tenure) vs. the trailing company-wide voluntary rate.',
    array['employee_snapshots', 'termination_history'],
    'pp_delta is an association (percentage-point gap vs. baseline), not a causal effect estimate.',
    'derived'
  ),
  (
    'c3_org_event_measures',
    'Attrition around org events (manager change / reorg / location change)',
    'Voluntary exit rate in the 6 months before vs. after a qualifying org_events record, for employees who experienced it.',
    array['org_events', 'termination_history', 'employee_snapshots'],
    'Illustrative before/after comparison, not a causal estimate of the event.',
    'derived'
  ),
  (
    'c3_exit_driver_frequency',
    'Exit interview coded drivers',
    'Frequency of primary/secondary coded drivers from exit_interviews among matched terminations.',
    array['exit_interviews', 'termination_history'],
    'Cells below the minimum cell size are suppressed.',
    'derived'
  ),
  (
    'attrition_risk_score',
    'Attrition risk score (risk-v0.2)',
    'Transparent, additive point-scoring rubric across six observable factors (engagement trajectory, compa/staleness, mobility, manager context, tenure hazard, recent org events) with published rounded weights; renormalized to 0-100 when at least 60 points of factor weight are available.',
    array['employee_snapshots', 'engagement_score_history', 'compensation_events', 'performance_reviews', 'termination_history', 'org_events'],
    'Not a fitted/trained ML model. Bands: Low 0-24, Moderate 25-49, Elevated 50-74, High 75-100. Insufficient data yields a null band.',
    'derived'
  ),
  (
    'c3_risk_backtest',
    'Attrition risk backtest',
    'Scores the active population as of 12 months before the reporting boundary, then checks for a voluntary exit in the following 12 months; reports exit rate and lift by band.',
    array['employee_snapshots', 'termination_history'],
    'Uses current company-wide benchmark curves rather than fully point-in-time ones; always returned, even when the observed lift is weak.',
    'derived'
  ),
  (
    'c3_manager_effectiveness',
    'Manager effectiveness composite',
    'Average of four components normalized 0-100 against the active company population: retention, engagement vs. company, rating-distribution deviation, and promotion rate.',
    array['employee_snapshots', 'termination_history'],
    'Managers with fewer than 5 active direct reports are excluded from ranking.',
    'derived'
  ),
  (
    'c3_promotion_pipeline',
    'Promotion pipeline',
    'Counts employees recommended for promotion (performance_reviews, trailing 12 months), the subset where a promotion is reflected on the latest snapshot (effective), and the remainder (approved, not yet effective).',
    array['performance_reviews', 'employee_snapshots'],
    null,
    'derived'
  ),
  (
    'c3_readiness_distribution',
    'Succession readiness distribution',
    'Evidence classification of nine-box placement text into readiness buckets (Ready Now / Ready 1-2 Years / Ready 3-5 Years / Not Ready / Unclassified).',
    array['employee_snapshots'],
    'Simple keyword mapping, not a fitted model. Buckets below the minimum cell size are suppressed.',
    'derived'
  ),
  (
    'c3_bench_coverage',
    'Bench coverage (proxy)',
    'Ratio of high-potential nine-box placements to active manager positions, used as a directional proxy for succession bench strength.',
    array['employee_snapshots', 'level_map'],
    'No explicit successor-designation field exists in the source data; this is an explicitly-labeled proxy, not a formal succession count.',
    'derived'
  )
on conflict (id) do update
  set name = excluded.name,
      definition = excluded.definition,
      source_tables = excluded.source_tables,
      notes = excluded.notes,
      reconciliation_target = excluded.reconciliation_target;

-- ---------------------------------------------------------------------------
-- Grants (defensive re-apply; safe no-op if already granted)
-- ---------------------------------------------------------------------------

grant usage on schema metrics to service_role, anon, authenticated;
grant select on all tables in schema metrics to service_role, anon, authenticated;
grant execute on all functions in schema metrics to service_role, anon, authenticated;
alter default privileges in schema metrics grant select on tables to service_role, anon, authenticated;
alter default privileges in schema metrics grant execute on functions to service_role, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'meridian_app') then
    execute 'grant usage on schema metrics to meridian_app';
    execute 'grant select on all tables in schema metrics to meridian_app';
    execute 'grant execute on all functions in schema metrics to meridian_app';
    execute 'grant select on public.customized_reports, public.customized_report_visuals, public.customized_report_versions, public.customized_report_access to meridian_app';
  end if;
  if exists (select 1 from pg_roles where rolname = 'meridian_wizard') then
    execute 'grant usage on schema metrics to meridian_wizard';
    execute 'grant select on all tables in schema metrics to meridian_wizard';
    execute 'grant execute on all functions in schema metrics to meridian_wizard';
    execute 'grant select on public.customized_reports, public.customized_report_visuals, public.customized_report_versions, public.customized_report_access to meridian_wizard';
  end if;
end $$;
