-- Meridian metrics semantic layer: conformed dims, measures, matviews, cell-size helpers

create schema if not exists metrics;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function metrics.min_cell_size()
returns integer
language sql
immutable
as $$ select 5 $$;

create or replace function metrics.reporting_as_of()
returns date
language sql
stable
as $$
  select coalesce(
    (select as_of_date from public.data_loads order by loaded_at desc limit 1),
    (select max(d) from (
      select max(hire_date) as d from public.employees
      union all
      select max(termination_date) from public.employees
      union all
      select max(event_date) from public.compensation_events
      union all
      select max(open_date) from public.requisitions
      union all
      select max(response_date) from public.engagement_responses
    ) x),
    current_date
  );
$$;

create or replace function metrics.tenure_band(hire_date date, as_of date)
returns text
language sql
immutable
as $$
  select case
    when hire_date is null then 'Unknown'
    when (as_of - hire_date) < 365 then '0-1 years'
    when (as_of - hire_date) < 730 then '1-2 years'
    when (as_of - hire_date) < 1825 then '2-5 years'
    else '5+ years'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Conformed dimensions (views)
-- ---------------------------------------------------------------------------

create or replace view metrics.dim_employee as
select
  e.employee_id,
  e.manager_employee_id,
  e.employment_status,
  e.hire_date,
  e.termination_date,
  e.termination_type,
  e.termination_reason_code,
  coalesce(e.function_name, e.department) as function_name,
  e.job_family,
  e.career_level,
  lm.apex_level,
  lm.level_band,
  e.job_code,
  e.office,
  coalesce(e.country, pzm.country) as country,
  coalesce(e.region, pzm.region) as region,
  e.pay_zone,
  pzm.apex_tier,
  e.work_arrangement,
  e.base_salary,
  e.currency_code,
  case
    when e.base_salary is null then null
    else e.base_salary * coalesce(fx.rate_to_usd, 1)
  end as base_salary_usd,
  e.salary_range_min,
  e.salary_range_mid,
  e.salary_range_max,
  e.compa_ratio,
  e.range_penetration,
  e.flight_risk_rating,
  e.number_of_direct_reports,
  e.latest_engagement_score,
  e.talent_designation,
  e.last_promotion_date,
  e.vesting_start_date,
  e.gender,
  e.race_ethnicity,
  metrics.tenure_band(e.hire_date, metrics.reporting_as_of()) as tenure_band
from public.employees e
left join public.level_map lm on lm.meridian_level = e.career_level
left join public.pay_zone_map pzm
  on pzm.meridian_pay_zone = e.pay_zone and pzm.office = e.office
left join public.fx_rates fx on fx.currency_code = e.currency_code;

create or replace view metrics.dim_org as
select distinct
  coalesce(function_name, department) as function_name,
  job_family,
  career_level
from public.employees
where coalesce(function_name, department) is not null;

create or replace view metrics.dim_location as
select distinct
  coalesce(e.region, pzm.region) as region,
  coalesce(e.country, pzm.country) as country,
  e.office,
  e.pay_zone,
  pzm.apex_tier
from public.employees e
left join public.pay_zone_map pzm
  on pzm.meridian_pay_zone = e.pay_zone and pzm.office = e.office
where e.office is not null;

create or replace view metrics.dim_req as
select
  r.req_id,
  r.title,
  r.function_name,
  r.career_level,
  r.office,
  r.hiring_manager_id,
  r.recruiter_id,
  r.open_date,
  r.close_date,
  r.outcome,
  r.headcount_planned
from public.requisitions r;

create or replace view metrics.dim_date as
select
  d::date as date_key,
  extract(year from d)::int as year,
  extract(quarter from d)::int as quarter,
  extract(month from d)::int as month,
  to_char(d, 'YYYY-MM') as year_month
from generate_series(
  date '2022-01-01',
  date '2030-12-31',
  interval '1 day'
) as g(d);

-- Privacy-safe employee view for Wizard / exports (no PII columns)
create or replace view metrics.employee_safe as
select
  employee_id,
  manager_employee_id,
  employment_status,
  hire_date,
  termination_date,
  termination_type,
  termination_reason_code,
  function_name,
  job_family,
  career_level,
  apex_level,
  level_band,
  job_code,
  office,
  country,
  region,
  pay_zone,
  apex_tier,
  work_arrangement,
  base_salary_usd,
  currency_code,
  salary_range_min,
  salary_range_mid,
  salary_range_max,
  compa_ratio,
  range_penetration,
  flight_risk_rating,
  number_of_direct_reports,
  latest_engagement_score,
  talent_designation,
  last_promotion_date,
  tenure_band
from metrics.dim_employee;

revoke all on metrics.employee_safe from public;
grant select on metrics.employee_safe to meridian_app, meridian_wizard;

-- ---------------------------------------------------------------------------
-- Filter application helper (SQL function used by measure RPCs)
-- filters jsonb shape mirrors FilterContext
-- ---------------------------------------------------------------------------

create or replace function metrics.employee_in_filters(emp metrics.dim_employee, filters jsonb)
returns boolean
language sql
stable
as $$
  select
    (
      coalesce(jsonb_array_length(filters->'functions'), 0) = 0
      or emp.function_name in (select jsonb_array_elements_text(filters->'functions'))
    )
    and (
      coalesce(jsonb_array_length(filters->'locations'), 0) = 0
      or emp.office in (select jsonb_array_elements_text(filters->'locations'))
      or emp.country in (select jsonb_array_elements_text(filters->'locations'))
    )
    and (
      coalesce(jsonb_array_length(filters->'levelBands'), 0) = 0
      or emp.level_band in (select jsonb_array_elements_text(filters->'levelBands'))
      or emp.career_level in (select jsonb_array_elements_text(filters->'levelBands'))
    )
    and (
      coalesce(jsonb_array_length(filters->'tenureBands'), 0) = 0
      or emp.tenure_band in (select jsonb_array_elements_text(filters->'tenureBands'))
    );
$$;

-- ---------------------------------------------------------------------------
-- Core measures (RPCs)
-- ---------------------------------------------------------------------------

create or replace function metrics.active_headcount(filters jsonb default '{}'::jsonb)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from metrics.dim_employee e
  where e.employment_status in ('Active', 'active', 'On Leave', 'on leave')
    and metrics.employee_in_filters(e, filters);
$$;

create or replace function metrics.elevated_flight_risk_count(filters jsonb default '{}'::jsonb)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from metrics.dim_employee e
  where e.employment_status in ('Active', 'active', 'On Leave', 'on leave')
    and lower(coalesce(e.flight_risk_rating, '')) = 'high'
    and metrics.employee_in_filters(e, filters);
$$;

create or replace function metrics.median_compa_ratio(filters jsonb default '{}'::jsonb)
returns numeric
language sql
stable
as $$
  select percentile_cont(0.5) within group (order by e.compa_ratio)
  from metrics.dim_employee e
  where e.employment_status in ('Active', 'active', 'On Leave', 'on leave')
    and e.compa_ratio is not null
    and metrics.employee_in_filters(e, filters);
$$;

create or replace function metrics.span_of_control(filters jsonb default '{}'::jsonb)
returns numeric
language sql
stable
as $$
  select coalesce(avg(e.number_of_direct_reports), 0)
  from metrics.dim_employee e
  where e.employment_status in ('Active', 'active', 'On Leave', 'on leave')
    and coalesce(e.number_of_direct_reports, 0) > 0
    and metrics.employee_in_filters(e, filters);
$$;

create or replace function metrics.manager_debt_count(filters jsonb default '{}'::jsonb)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from metrics.dim_employee e
  where e.employment_status in ('Active', 'active', 'On Leave', 'on leave')
    and e.number_of_direct_reports = 1
    and metrics.employee_in_filters(e, filters);
$$;

create or replace function metrics.voluntary_attrition_rate(filters jsonb default '{}'::jsonb)
returns numeric
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  window_start date := (as_of - interval '12 months')::date;
  voluntary_terms numeric;
  start_hc numeric;
  end_hc numeric;
  avg_hc numeric;
begin
  select count(*)::numeric into voluntary_terms
  from metrics.dim_employee e
  where lower(coalesce(e.termination_type, '')) = 'voluntary'
    and e.termination_date is not null
    and e.termination_date > window_start
    and e.termination_date <= as_of
    and metrics.employee_in_filters(e, filters);

  select count(*)::numeric into end_hc
  from metrics.dim_employee e
  where e.employment_status in ('Active', 'active', 'On Leave', 'on leave')
    and metrics.employee_in_filters(e, filters);

  -- Approximate start headcount: actives + terms in window (same population proxy)
  start_hc := end_hc + voluntary_terms;
  avg_hc := nullif((start_hc + end_hc) / 2.0, 0);

  if avg_hc is null then
    return 0;
  end if;
  return round((voluntary_terms / avg_hc) * 100.0, 1);
end;
$$;

create or replace function metrics.involuntary_attrition_count(filters jsonb default '{}'::jsonb)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from metrics.dim_employee e
  where lower(coalesce(e.termination_type, '')) = 'involuntary'
    and e.termination_date is not null
    and e.termination_date > (metrics.reporting_as_of() - interval '12 months')::date
    and e.termination_date <= metrics.reporting_as_of()
    and metrics.employee_in_filters(e, filters);
$$;

create or replace function metrics.regrettable_attrition_count(filters jsonb default '{}'::jsonb)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from metrics.dim_employee e
  left join lateral (
    select pr.rating
    from public.performance_reviews pr
    where pr.employee_id = e.employee_id
    order by pr.review_date desc nulls last
    limit 1
  ) last_review on true
  where lower(coalesce(e.termination_type, '')) = 'voluntary'
    and e.termination_date is not null
    and e.termination_date > (metrics.reporting_as_of() - interval '12 months')::date
    and e.termination_date <= metrics.reporting_as_of()
    and (
      last_review.rating in ('Exceeded', 'Significantly Exceeded')
      or e.talent_designation in ('Top Talent', 'Strong Performer')
    )
    and metrics.employee_in_filters(e, filters);
$$;

create or replace function metrics.open_requisitions(filters jsonb default '{}'::jsonb)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from metrics.dim_req r
  where lower(coalesce(r.outcome, '')) = 'open'
    and (
      coalesce(jsonb_array_length(filters->'functions'), 0) = 0
      or r.function_name in (select jsonb_array_elements_text(filters->'functions'))
    )
    and (
      coalesce(jsonb_array_length(filters->'locations'), 0) = 0
      or r.office in (select jsonb_array_elements_text(filters->'locations'))
    );
$$;

create or replace function metrics.time_to_fill_avg(filters jsonb default '{}'::jsonb)
returns numeric
language sql
stable
as $$
  select coalesce(avg((r.close_date - r.open_date)), 0)
  from metrics.dim_req r
  where lower(coalesce(r.outcome, '')) = 'filled'
    and r.open_date is not null
    and r.close_date is not null
    and (
      coalesce(jsonb_array_length(filters->'functions'), 0) = 0
      or r.function_name in (select jsonb_array_elements_text(filters->'functions'))
    );
$$;

create or replace function metrics.first_offer_acceptance_rate(filters jsonb default '{}'::jsonb)
returns numeric
language sql
stable
as $$
  with scoped as (
    select o.*
    from public.offers o
    join metrics.dim_req r on r.req_id = o.req_id
    where coalesce(o.first_offer, true)
      and (
        coalesce(jsonb_array_length(filters->'functions'), 0) = 0
        or r.function_name in (select jsonb_array_elements_text(filters->'functions'))
      )
  )
  select case
    when count(*) = 0 then 0
    else round(
      100.0 * count(*) filter (where lower(outcome) in ('accepted', 'accept')) / count(*)::numeric,
      1
    )
  end
  from scoped;
$$;

create or replace function metrics.engagement_survey_mean(filters jsonb default '{}'::jsonb)
returns numeric
language sql
stable
as $$
  select round(avg(er.score)::numeric, 2)
  from public.engagement_responses er
  where (
    coalesce(jsonb_array_length(filters->'functions'), 0) = 0
    or er.function_name in (select jsonb_array_elements_text(filters->'functions'))
  )
  and (
    coalesce(jsonb_array_length(filters->'locations'), 0) = 0
    or er.office in (select jsonb_array_elements_text(filters->'locations'))
  );
$$;

create or replace function metrics.engagement_per_employee_mean(filters jsonb default '{}'::jsonb)
returns numeric
language sql
stable
as $$
  select round(avg(e.latest_engagement_score)::numeric, 2)
  from metrics.dim_employee e
  where e.employment_status in ('Active', 'active', 'On Leave', 'on leave')
    and e.latest_engagement_score is not null
    and metrics.employee_in_filters(e, filters);
$$;

create or replace function metrics.compa_below_090_count(filters jsonb default '{}'::jsonb)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from metrics.dim_employee e
  where e.employment_status in ('Active', 'active', 'On Leave', 'on leave')
    and e.compa_ratio is not null
    and e.compa_ratio < 0.90
    and metrics.employee_in_filters(e, filters);
$$;

-- Market position: base_salary_usd / ACI P50 via level_map + pay_zone_map
create or replace function metrics.market_position_median(filters jsonb default '{}'::jsonb)
returns numeric
language sql
stable
as $$
  select percentile_cont(0.5) within group (
    order by (e.base_salary_usd / nullif(mb.p50, 0))
  )
  from metrics.dim_employee e
  join public.market_benchmarks mb
    on mb.function_name = e.function_name
   and mb.apex_level = e.apex_level
   and mb.apex_tier = e.apex_tier
  where e.employment_status in ('Active', 'active', 'On Leave', 'on leave')
    and e.base_salary_usd is not null
    and metrics.employee_in_filters(e, filters);
$$;

-- Cell-size gate for grouped cuts
create or replace function metrics.suppress_small_n(n bigint)
returns boolean
language sql
immutable
as $$
  select n < metrics.min_cell_size();
$$;

-- ---------------------------------------------------------------------------
-- Materialized aggregates
-- ---------------------------------------------------------------------------

create materialized view if not exists metrics.mv_monthly_headcount as
select
  date_trunc('month', d.date_key)::date as month_start,
  e.function_name,
  e.office,
  e.career_level,
  count(*) filter (
    where e.hire_date is not null
      and e.hire_date <= d.date_key
      and (e.termination_date is null or e.termination_date > d.date_key)
  ) as headcount
from metrics.dim_date d
cross join metrics.dim_employee e
where d.date_key = date_trunc('month', d.date_key)::date
  and d.date_key >= date '2023-01-01'
  and d.date_key <= metrics.reporting_as_of()
group by 1, 2, 3, 4;

create materialized view if not exists metrics.mv_attrition_by_cohort as
select
  date_trunc('month', e.termination_date)::date as term_month,
  e.function_name,
  e.career_level,
  e.office,
  e.tenure_band,
  e.termination_type,
  count(*) as terminations
from metrics.dim_employee e
where e.termination_date is not null
group by 1, 2, 3, 4, 5, 6;

create materialized view if not exists metrics.mv_funnel_conversion as
select
  f.stage_order,
  f.stage_name,
  r.function_name,
  sum(f.event_count) as event_count
from public.funnel_events f
join metrics.dim_req r on r.req_id = f.req_id
group by 1, 2, 3;

create or replace function metrics.refresh_materialized()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view metrics.mv_monthly_headcount;
  refresh materialized view metrics.mv_attrition_by_cohort;
  refresh materialized view metrics.mv_funnel_conversion;
end;
$$;

grant execute on function metrics.refresh_materialized() to meridian_app;
grant select on metrics.mv_monthly_headcount to meridian_app, meridian_wizard;
grant select on metrics.mv_attrition_by_cohort to meridian_app, meridian_wizard;
grant select on metrics.mv_funnel_conversion to meridian_app, meridian_wizard;

grant execute on all functions in schema metrics to meridian_app, meridian_wizard;
