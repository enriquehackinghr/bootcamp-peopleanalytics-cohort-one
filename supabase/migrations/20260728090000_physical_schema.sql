-- Meridian v0.1 physical schema, mapping tables, staging, data_loads, RLS stubs
-- Minimum cell size for demographic cuts: 5 (locked)

create extension if not exists "pgcrypto";

create schema if not exists staging;
create schema if not exists metrics;

-- ---------------------------------------------------------------------------
-- Mapping tables (required before market measures)
-- ---------------------------------------------------------------------------

create table if not exists public.level_map (
  meridian_level text primary key,
  apex_level text not null,
  level_band text not null,
  is_manager boolean not null default false
);

create table if not exists public.pay_zone_map (
  meridian_pay_zone text not null,
  office text not null,
  country text not null,
  region text not null,
  apex_tier integer not null,
  market_index numeric(6, 2) not null,
  primary key (meridian_pay_zone, office)
);

create table if not exists public.fx_rates (
  currency_code text primary key,
  rate_to_usd numeric(12, 6) not null,
  source_note text
);

-- ---------------------------------------------------------------------------
-- Physical fact / dimension load tables (14)
-- ---------------------------------------------------------------------------

create table if not exists public.employees (
  employee_id text primary key,
  first_name text,
  last_name text,
  work_email text,
  date_of_birth date,
  manager_employee_id text references public.employees (employee_id),
  employment_status text not null,
  hire_date date,
  termination_date date,
  termination_type text,
  termination_reason_code text,
  function_name text,
  department text,
  job_family text,
  career_level text,
  job_code text,
  office text,
  country text,
  region text,
  pay_zone text,
  work_arrangement text,
  base_salary numeric(14, 2),
  currency_code text,
  salary_range_min numeric(14, 2),
  salary_range_mid numeric(14, 2),
  salary_range_max numeric(14, 2),
  compa_ratio numeric(8, 4),
  range_penetration numeric(8, 4),
  flight_risk_rating text,
  number_of_direct_reports integer,
  latest_engagement_score numeric(6, 2),
  talent_designation text,
  last_promotion_date date,
  vesting_start_date date,
  gender text,
  race_ethnicity text
);

create table if not exists public.compensation_events (
  event_id text primary key,
  employee_id text not null references public.employees (employee_id),
  event_date date not null,
  event_type text,
  base_salary numeric(14, 2),
  currency_code text,
  equity_grant numeric(14, 2),
  merit_percent numeric(8, 4),
  notes text
);

create table if not exists public.performance_reviews (
  review_id text primary key,
  employee_id text not null references public.employees (employee_id),
  reviewer_employee_id text references public.employees (employee_id),
  review_cycle text,
  review_date date,
  rating text,
  manager_initial_rating text,
  calibrated_rating text,
  self_rating text,
  calibration_adjusted boolean default false,
  promotion_recommendation text,
  nine_box_x numeric(6, 2),
  nine_box_y numeric(6, 2)
);

create table if not exists public.competency_scores (
  review_id text not null references public.performance_reviews (review_id),
  competency_id text not null,
  score numeric(6, 2) not null,
  primary key (review_id, competency_id)
);

create table if not exists public.engagement_questions (
  question_id text primary key,
  category text not null,
  question_text text not null,
  scale_min integer not null default 1,
  scale_max integer not null default 5
);

create table if not exists public.engagement_responses (
  response_id text primary key,
  survey_period text not null,
  response_date date,
  function_name text,
  office text,
  career_level text,
  tenure_band text,
  category text,
  question_id text references public.engagement_questions (question_id),
  score numeric(6, 2) not null
);

create table if not exists public.engagement_open_ended (
  oe_response_id text primary key,
  response_id text references public.engagement_responses (response_id),
  survey_period text,
  theme text,
  response_text text
);

create table if not exists public.requisitions (
  req_id text primary key,
  title text,
  function_name text,
  career_level text,
  office text,
  hiring_manager_id text references public.employees (employee_id),
  recruiter_id text,
  open_date date,
  close_date date,
  outcome text,
  headcount_planned integer
);

create table if not exists public.funnel_events (
  req_id text not null references public.requisitions (req_id),
  stage_order integer not null,
  stage_name text not null,
  event_count integer not null default 0,
  primary key (req_id, stage_order)
);

create table if not exists public.offers (
  offer_id text primary key,
  req_id text not null references public.requisitions (req_id),
  offer_date date,
  outcome text,
  decline_reason text,
  first_offer boolean default true
);

create table if not exists public.application_sources (
  req_id text not null references public.requisitions (req_id),
  source text not null,
  application_count integer not null default 0,
  primary key (req_id, source)
);

create table if not exists public.recruiters (
  recruiter_id text primary key,
  recruiter_name text,
  avg_time_to_fill_days numeric(8, 2),
  offer_accept_rate numeric(8, 4),
  hires_count integer
);

create table if not exists public.market_benchmarks (
  function_name text not null,
  apex_level text not null,
  apex_tier integer not null,
  p25 numeric(14, 2),
  p50 numeric(14, 2),
  p75 numeric(14, 2),
  currency_code text not null default 'USD',
  primary key (function_name, apex_level, apex_tier)
);

create table if not exists public.competency_framework (
  competency_id text primary key,
  competency_name text not null,
  competency_group text,
  applies_to text
);

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create table if not exists public.data_loads (
  id uuid primary key default gen_random_uuid(),
  loaded_at timestamptz not null default now(),
  source_type text not null,
  file_names text[] not null default '{}',
  row_counts jsonb not null default '{}'::jsonb,
  validation_summary text,
  loaded_by text,
  as_of_date date
);

create index if not exists data_loads_loaded_at_idx on public.data_loads (loaded_at desc);

-- ---------------------------------------------------------------------------
-- Staging mirrors (untyped-friendly text columns where needed; promote casts)
-- ---------------------------------------------------------------------------

create table if not exists staging.employees (like public.employees including defaults);
create table if not exists staging.compensation_events (like public.compensation_events including defaults);
create table if not exists staging.performance_reviews (like public.performance_reviews including defaults);
create table if not exists staging.competency_scores (like public.competency_scores including defaults);
create table if not exists staging.engagement_responses (like public.engagement_responses including defaults);
create table if not exists staging.engagement_questions (like public.engagement_questions including defaults);
create table if not exists staging.engagement_open_ended (like public.engagement_open_ended including defaults);
create table if not exists staging.requisitions (like public.requisitions including defaults);
create table if not exists staging.funnel_events (like public.funnel_events including defaults);
create table if not exists staging.offers (like public.offers including defaults);
create table if not exists staging.application_sources (like public.application_sources including defaults);
create table if not exists staging.recruiters (like public.recruiters including defaults);
create table if not exists staging.market_benchmarks (like public.market_benchmarks including defaults);
create table if not exists staging.competency_framework (like public.competency_framework including defaults);

-- Drop FKs on staging copies if inherited oddly — recreate staging without FKs
do $$
declare
  r record;
begin
  for r in
    select conname, conrelid::regclass as tbl
    from pg_constraint
    where contype = 'f'
      and connamespace = 'staging'::regnamespace
  loop
    execute format('alter table %s drop constraint if exists %I', r.tbl, r.conname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Seed mapping tables (ACI survey-period FX; illustrative Meridian maps)
-- ---------------------------------------------------------------------------

insert into public.fx_rates (currency_code, rate_to_usd, source_note) values
  ('USD', 1.000000, 'Identity'),
  ('CAD', 0.736000, 'ACI survey-period rate'),
  ('EUR', 1.082000, 'ACI survey-period rate')
on conflict (currency_code) do update
  set rate_to_usd = excluded.rate_to_usd,
      source_note = excluded.source_note;

insert into public.level_map (meridian_level, apex_level, level_band, is_manager) values
  ('P1', 'I', 'IC', false),
  ('P2', 'II', 'IC', false),
  ('P3', 'III', 'IC', false),
  ('P4', 'IV', 'IC', false),
  ('P5', 'V', 'IC', false),
  ('P6', 'VI', 'IC', false),
  ('P7', 'VII', 'IC', false),
  ('M3', 'M', 'Manager', true),
  ('M4', 'M', 'Manager', true),
  ('M5', 'SrM', 'Manager', true),
  ('M6', 'D', 'Director+', true),
  ('M7', 'VP', 'Director+', true),
  ('M8', 'SVP', 'Director+', true)
on conflict (meridian_level) do update
  set apex_level = excluded.apex_level,
      level_band = excluded.level_band,
      is_manager = excluded.is_manager;

insert into public.pay_zone_map (meridian_pay_zone, office, country, region, apex_tier, market_index) values
  ('High', 'Boston', 'United States', 'North America', 1, 100.00),
  ('High', 'Dublin', 'Ireland', 'EMEA', 7, 80.00),
  ('High', 'Toronto', 'Canada', 'North America', 6, 76.00),
  ('Medium', 'Austin', 'United States', 'North America', 3, 90.00),
  ('Medium', 'Chicago', 'United States', 'North America', 3, 90.00),
  ('Standard', 'Remote US', 'United States', 'North America', 4, 85.00)
on conflict (meridian_pay_zone, office) do update
  set country = excluded.country,
      region = excluded.region,
      apex_tier = excluded.apex_tier,
      market_index = excluded.market_index;

-- ---------------------------------------------------------------------------
-- Roles (Wizard read-only). Safe to re-run.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select from pg_roles where rolname = 'meridian_app') then
    create role meridian_app nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'meridian_wizard') then
    create role meridian_wizard nologin;
  end if;
end $$;

grant usage on schema public to meridian_app, meridian_wizard;
grant usage on schema metrics to meridian_app, meridian_wizard;
grant select on all tables in schema public to meridian_app;
grant select on all tables in schema metrics to meridian_app, meridian_wizard;
alter default privileges in schema metrics grant select on tables to meridian_app, meridian_wizard;

-- Wizard: no write path
revoke insert, update, delete, truncate on all tables in schema public from meridian_wizard;
revoke insert, update, delete, truncate on all tables in schema metrics from meridian_wizard;

-- ---------------------------------------------------------------------------
-- RLS policies written now, enforced Day 4 (enable later). Policies draft against auth.uid().
-- ---------------------------------------------------------------------------

alter table public.employees enable row level security;
alter table public.compensation_events enable row level security;
alter table public.performance_reviews enable row level security;

-- Placeholder claim helpers — Day 4 will map auth.uid() → role/function/manager
create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'app_role', 'cpo');
$$;

create or replace function public.current_function_scope()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'function_name';
$$;

create or replace function public.current_manager_scope()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'employee_id';
$$;

drop policy if exists employees_cpo_all on public.employees;
create policy employees_cpo_all on public.employees
  for select
  using (public.current_app_role() = 'cpo');

drop policy if exists employees_function_leader on public.employees;
create policy employees_function_leader on public.employees
  for select
  using (
    public.current_app_role() = 'function_leader'
    and function_name = public.current_function_scope()
  );

drop policy if exists employees_manager_tree on public.employees;
create policy employees_manager_tree on public.employees
  for select
  using (
    public.current_app_role() = 'manager'
    and employee_id in (
      with recursive tree as (
        select e.employee_id
        from public.employees e
        where e.manager_employee_id = public.current_manager_scope()
           or e.employee_id = public.current_manager_scope()
        union all
        select c.employee_id
        from public.employees c
        join tree t on c.manager_employee_id = t.employee_id
      )
      select employee_id from tree
    )
  );

-- Policies are present in the catalog; RLS stays disabled until Day 4 enforcement.
-- Enabling RLS later must not require a query-layer rewrite (SEM-8 / NFR-9).
alter table public.employees disable row level security;
alter table public.compensation_events disable row level security;
alter table public.performance_reviews disable row level security;
