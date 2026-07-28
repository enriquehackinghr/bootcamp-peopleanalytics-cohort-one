-- Expose metrics RPCs and catalogs to PostgREST (public schema)

create or replace function public.active_headcount(filters jsonb default '{}'::jsonb)
returns bigint language sql stable as $$ select metrics.active_headcount(filters) $$;

create or replace function public.voluntary_attrition_rate(filters jsonb default '{}'::jsonb)
returns numeric language sql stable as $$ select metrics.voluntary_attrition_rate(filters) $$;

create or replace function public.involuntary_attrition_count(filters jsonb default '{}'::jsonb)
returns bigint language sql stable as $$ select metrics.involuntary_attrition_count(filters) $$;

create or replace function public.regrettable_attrition_count(filters jsonb default '{}'::jsonb)
returns bigint language sql stable as $$ select metrics.regrettable_attrition_count(filters) $$;

create or replace function public.elevated_flight_risk_count(filters jsonb default '{}'::jsonb)
returns bigint language sql stable as $$ select metrics.elevated_flight_risk_count(filters) $$;

create or replace function public.median_compa_ratio(filters jsonb default '{}'::jsonb)
returns numeric language sql stable as $$ select metrics.median_compa_ratio(filters) $$;

create or replace function public.compa_below_090_count(filters jsonb default '{}'::jsonb)
returns bigint language sql stable as $$ select metrics.compa_below_090_count(filters) $$;

create or replace function public.market_position_median(filters jsonb default '{}'::jsonb)
returns numeric language sql stable as $$ select metrics.market_position_median(filters) $$;

create or replace function public.span_of_control(filters jsonb default '{}'::jsonb)
returns numeric language sql stable as $$ select metrics.span_of_control(filters) $$;

create or replace function public.manager_debt_count(filters jsonb default '{}'::jsonb)
returns bigint language sql stable as $$ select metrics.manager_debt_count(filters) $$;

create or replace function public.open_requisitions(filters jsonb default '{}'::jsonb)
returns bigint language sql stable as $$ select metrics.open_requisitions(filters) $$;

create or replace function public.time_to_fill_avg(filters jsonb default '{}'::jsonb)
returns numeric language sql stable as $$ select metrics.time_to_fill_avg(filters) $$;

create or replace function public.first_offer_acceptance_rate(filters jsonb default '{}'::jsonb)
returns numeric language sql stable as $$ select metrics.first_offer_acceptance_rate(filters) $$;

create or replace function public.engagement_survey_mean(filters jsonb default '{}'::jsonb)
returns numeric language sql stable as $$ select metrics.engagement_survey_mean(filters) $$;

create or replace function public.engagement_per_employee_mean(filters jsonb default '{}'::jsonb)
returns numeric language sql stable as $$ select metrics.engagement_per_employee_mean(filters) $$;

create or replace function public.reporting_as_of()
returns date language sql stable as $$ select metrics.reporting_as_of() $$;

create or replace function public.refresh_materialized()
returns void language sql security definer as $$ select metrics.refresh_materialized() $$;

create or replace view public.methodology_catalog as
select * from metrics.methodology_catalog;

create or replace view public.hierarchy_declarations as
select * from metrics.hierarchy_declarations;

create or replace view public.mv_funnel_conversion as
select * from metrics.mv_funnel_conversion;

create or replace view public.employee_safe as
select * from metrics.employee_safe;

grant execute on all functions in schema public to anon, authenticated, service_role;
grant select on public.methodology_catalog to anon, authenticated, service_role;
grant select on public.hierarchy_declarations to anon, authenticated, service_role;
grant select on public.mv_funnel_conversion to anon, authenticated, service_role;
grant select on public.employee_safe to anon, authenticated, service_role;
