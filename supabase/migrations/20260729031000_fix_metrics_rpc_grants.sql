-- Allow PostgREST (service_role / anon) to run public metric wrappers that
-- call into the metrics schema. Wrappers become SECURITY DEFINER so callers
-- do not need direct USAGE on schema metrics.

grant usage on schema metrics to service_role, anon, authenticated;
grant select on all tables in schema metrics to service_role, anon, authenticated;
grant select on all sequences in schema metrics to service_role;
grant execute on all functions in schema metrics to service_role, anon, authenticated;
alter default privileges in schema metrics grant select on tables to service_role, anon, authenticated;
alter default privileges in schema metrics grant execute on functions to service_role, anon, authenticated;

create or replace function public.active_headcount(filters jsonb default '{}'::jsonb)
returns bigint
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.active_headcount(filters) $$;

create or replace function public.voluntary_attrition_rate(filters jsonb default '{}'::jsonb)
returns numeric
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.voluntary_attrition_rate(filters) $$;

create or replace function public.involuntary_attrition_count(filters jsonb default '{}'::jsonb)
returns bigint
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.involuntary_attrition_count(filters) $$;

create or replace function public.regrettable_attrition_count(filters jsonb default '{}'::jsonb)
returns bigint
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.regrettable_attrition_count(filters) $$;

create or replace function public.elevated_flight_risk_count(filters jsonb default '{}'::jsonb)
returns bigint
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.elevated_flight_risk_count(filters) $$;

create or replace function public.median_compa_ratio(filters jsonb default '{}'::jsonb)
returns numeric
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.median_compa_ratio(filters) $$;

create or replace function public.compa_below_090_count(filters jsonb default '{}'::jsonb)
returns bigint
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.compa_below_090_count(filters) $$;

create or replace function public.market_position_median(filters jsonb default '{}'::jsonb)
returns numeric
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.market_position_median(filters) $$;

create or replace function public.span_of_control(filters jsonb default '{}'::jsonb)
returns numeric
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.span_of_control(filters) $$;

create or replace function public.manager_debt_count(filters jsonb default '{}'::jsonb)
returns bigint
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.manager_debt_count(filters) $$;

create or replace function public.open_requisitions(filters jsonb default '{}'::jsonb)
returns bigint
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.open_requisitions(filters) $$;

create or replace function public.time_to_fill_avg(filters jsonb default '{}'::jsonb)
returns numeric
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.time_to_fill_avg(filters) $$;

create or replace function public.first_offer_acceptance_rate(filters jsonb default '{}'::jsonb)
returns numeric
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.first_offer_acceptance_rate(filters) $$;

create or replace function public.engagement_survey_mean(filters jsonb default '{}'::jsonb)
returns numeric
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.engagement_survey_mean(filters) $$;

create or replace function public.engagement_per_employee_mean(filters jsonb default '{}'::jsonb)
returns numeric
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.engagement_per_employee_mean(filters) $$;

create or replace function public.reporting_as_of()
returns date
language sql
stable
security definer
set search_path = public, metrics
as $$ select metrics.reporting_as_of() $$;

create or replace function public.refresh_materialized()
returns void
language sql
security definer
set search_path = public, metrics
as $$ select metrics.refresh_materialized() $$;

grant execute on all functions in schema public to anon, authenticated, service_role;
