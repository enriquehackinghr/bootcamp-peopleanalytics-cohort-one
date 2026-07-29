-- Class 3 extension tables: storage + ingest only (no metrics views yet).

create table if not exists public.employee_snapshots (
  snapshot_id text primary key,
  as_of_date date,
  employee_id text,
  in_employee_master text,
  employment_status text,
  function_name text,
  department text,
  career_level text,
  career_track text,
  job_family text,
  manager_employee_id text,
  office_location text,
  work_country text,
  pay_zone text,
  work_arrangement text,
  currency_code text,
  base_salary numeric(14, 2),
  salary_range_mid numeric(14, 2),
  compa_ratio numeric(8, 4),
  range_penetration numeric(8, 4),
  perf_rating text,
  nine_box_placement text,
  engagement_score numeric(6, 2),
  flight_risk_rating text,
  tenure_months numeric(8, 2),
  direct_reports integer,
  months_since_promotion integer,
  org_events_last_6m integer
);

create table if not exists public.termination_history (
  termination_id text primary key,
  employee_id text,
  in_employee_master text,
  hire_date date,
  termination_date date,
  fiscal_year integer,
  termination_type text,
  termination_reason text,
  tenure_months_at_exit numeric(8, 2),
  tenure_band_at_exit text,
  function_name text,
  department text,
  career_level text,
  career_track text,
  job_family text,
  office_location text,
  work_country text,
  pay_zone text,
  manager_employee_id text,
  currency_code text,
  compa_ratio_at_exit numeric(8, 4),
  last_perf_rating text,
  talent_designation text,
  rehire_eligible text
);

create table if not exists public.engagement_score_history (
  response_id text primary key,
  employee_id text,
  observation_date date,
  engagement_score numeric(6, 2),
  instrument text,
  scale_min numeric(6, 2),
  scale_max numeric(6, 2),
  collection_method text
);

create table if not exists public.engagement_survey_waves (
  response_id text primary key,
  wave_id text,
  wave_label text,
  response_date date,
  function_name text,
  department text,
  level_band text,
  tenure_band text,
  office_location text,
  is_manager boolean,
  q01 numeric(6, 2),
  q02 numeric(6, 2),
  q03 numeric(6, 2),
  q04 numeric(6, 2),
  q05 numeric(6, 2),
  q06 numeric(6, 2),
  q07 numeric(6, 2),
  q08 numeric(6, 2),
  q09 numeric(6, 2),
  q10 numeric(6, 2),
  q11 numeric(6, 2),
  q12 numeric(6, 2),
  q13 numeric(6, 2),
  q14 numeric(6, 2),
  q15 numeric(6, 2),
  q16 numeric(6, 2),
  q17 numeric(6, 2),
  q18 numeric(6, 2),
  q19 numeric(6, 2),
  q20 numeric(6, 2),
  q21 numeric(6, 2),
  q22 numeric(6, 2),
  q23 numeric(6, 2),
  q24 numeric(6, 2),
  q25 numeric(6, 2),
  q26 numeric(6, 2),
  q27 numeric(6, 2),
  q28 numeric(6, 2),
  q29 numeric(6, 2),
  q30 numeric(6, 2)
);

create table if not exists public.org_events (
  event_id text primary key,
  employee_id text,
  event_date date,
  event_type text,
  prior_value text,
  new_value text,
  direction text,
  pct_change numeric(10, 4),
  reorg_scope text,
  initiated_by text
);

create table if not exists public.exit_interviews (
  interview_id text primary key,
  employee_id text,
  termination_date date,
  interview_date date,
  function_name text,
  career_level text,
  office_location text,
  primary_driver text,
  secondary_driver text,
  notice_days integer,
  would_recommend_score numeric(6, 2),
  destination_type text,
  regrettable_flag text,
  comment text
);

grant select on public.employee_snapshots to anon, authenticated, service_role;
grant select on public.termination_history to anon, authenticated, service_role;
grant select on public.engagement_score_history to anon, authenticated, service_role;
grant select on public.engagement_survey_waves to anon, authenticated, service_role;
grant select on public.org_events to anon, authenticated, service_role;
grant select on public.exit_interviews to anon, authenticated, service_role;

grant insert, update, delete on public.employee_snapshots to service_role;
grant insert, update, delete on public.termination_history to service_role;
grant insert, update, delete on public.engagement_score_history to service_role;
grant insert, update, delete on public.engagement_survey_waves to service_role;
grant insert, update, delete on public.org_events to service_role;
grant insert, update, delete on public.exit_interviews to service_role;

create or replace function public.replace_table_rows(
  target_table text,
  rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if target_table not in (
    'employees',
    'compensation_events',
    'performance_reviews',
    'competency_scores',
    'engagement_responses',
    'engagement_questions',
    'engagement_open_ended',
    'requisitions',
    'funnel_events',
    'offers',
    'application_sources',
    'recruiters',
    'market_benchmarks',
    'competency_framework',
    'employee_snapshots',
    'termination_history',
    'engagement_score_history',
    'engagement_survey_waves',
    'org_events',
    'exit_interviews'
  ) then
    raise exception 'Refusing to replace unknown table %', target_table;
  end if;

  execute format('delete from public.%I where true', target_table);

  if rows is null or jsonb_array_length(rows) = 0 then
    return 0;
  end if;

  execute format(
    'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)',
    target_table,
    target_table
  )
  using rows;

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.replace_table_rows(text, jsonb) to service_role;
