-- Class 3 manager effectiveness + talent/succession analytics.
--
-- Association language only: "effectiveness" components are normalized,
-- transparent comparisons against the active company population — not a
-- fitted/trained model. Small teams are excluded from ranking (n<5) per the
-- locked minimum cell size.

create schema if not exists metrics;

-- ---------------------------------------------------------------------------
-- Manager effectiveness: four normalized (0-100) components averaged into a
-- single composite. Managers with fewer than metrics.min_cell_size() active
-- direct reports are returned with excluded=true and null components/score.
-- ---------------------------------------------------------------------------

create or replace function metrics.c3_manager_effectiveness(filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  window_start date := (as_of - interval '12 months')::date;
  snap_asof date;
  company_engagement numeric;
  company_top_pct numeric;
  result jsonb;
begin
  select max(as_of_date) into snap_asof from public.employee_snapshots where as_of_date <= as_of;

  select avg(engagement_score) into company_engagement
  from metrics.dim_snapshot s
  where s.as_of_date = snap_asof and s.employment_status ilike 'active%';

  select round(100.0 * count(*) filter (where perf_rating in ('Exceeded', 'Significantly Exceeded'))
               / nullif(count(*) filter (where perf_rating is not null), 0), 1)
  into company_top_pct
  from metrics.dim_snapshot s
  where s.as_of_date = snap_asof and s.employment_status ilike 'active%';

  with managers as (
    select distinct s.manager_employee_id as manager_id
    from metrics.dim_snapshot s
    where s.as_of_date = snap_asof
      and s.employment_status ilike 'active%'
      and s.manager_employee_id is not null
      and metrics.snapshot_in_filters(s, filters)
  ),
  team as (
    select
      m.manager_id,
      count(*) as team_size,
      avg(s.engagement_score) as team_engagement,
      round(100.0 * count(*) filter (where s.perf_rating in ('Exceeded', 'Significantly Exceeded'))
                   / nullif(count(*) filter (where s.perf_rating is not null), 0), 1) as team_top_pct,
      round(100.0 * count(*) filter (where s.months_since_promotion is not null and s.months_since_promotion < 12)
                   / nullif(count(*), 0), 1) as promotion_rate_pct
    from managers m
    join metrics.dim_snapshot s
      on s.manager_employee_id = m.manager_id
     and s.as_of_date = snap_asof
     and s.employment_status ilike 'active%'
    group by m.manager_id
  ),
  team_voluntary as (
    select
      m.manager_id,
      count(th.termination_id) as voluntary_exits
    from managers m
    left join public.termination_history th
      on th.manager_employee_id = m.manager_id
     and lower(coalesce(th.termination_type, '')) = 'voluntary'
     and th.termination_date > window_start and th.termination_date <= as_of
    group by m.manager_id
  ),
  scored as (
    select
      t.manager_id,
      t.team_size,
      (t.team_size < metrics.min_cell_size()) as excluded,
      round(greatest(0, least(100, 100 - least(100,
        (100.0 * coalesce(tv.voluntary_exits, 0) / nullif(t.team_size, 0)) * (100.0 / 30)
      ))), 1) as retention,
      round(greatest(0, least(100, 50 + coalesce(t.team_engagement - company_engagement, 0) * 25)), 1) as engagement_vs_company,
      round(greatest(0, 100 - abs(coalesce(t.team_top_pct, 0) - coalesce(company_top_pct, 0)) * 2), 1) as rating_distribution_deviation,
      least(100, coalesce(t.promotion_rate_pct, 0)) as promotion_rate
    from team t
    left join team_voluntary tv on tv.manager_id = t.manager_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'manager_id', manager_id,
      'team_size', team_size,
      'excluded', excluded,
      'composite_score', case when excluded then null
        else round((retention + engagement_vs_company + rating_distribution_deviation + promotion_rate) / 4.0, 1) end,
      'components', case when excluded then null else jsonb_build_object(
        'retention', retention,
        'engagement_vs_company', engagement_vs_company,
        'rating_distribution_deviation', rating_distribution_deviation,
        'promotion_rate', promotion_rate
      ) end,
      'peer_basis', 'Each component is normalized 0-100 against the active company population at the reporting boundary.'
    ) order by team_size desc), '[]'::jsonb)
  into result
  from scored;

  return result;
end;
$$;

-- Count of non-excluded managers whose composite score is below the median
-- composite score among non-excluded managers in scope.
create or replace function metrics.c3_managers_below_median_count(filters jsonb default '{}'::jsonb)
returns bigint
language plpgsql
stable
as $$
declare
  managers jsonb;
  med numeric;
  n bigint;
begin
  managers := metrics.c3_manager_effectiveness(filters);

  select percentile_cont(0.5) within group (order by (m->>'composite_score')::numeric)
  into med
  from jsonb_array_elements(managers) m
  where coalesce((m->>'excluded')::boolean, true) = false;

  select count(*) into n
  from jsonb_array_elements(managers) m
  where coalesce((m->>'excluded')::boolean, true) = false
    and (m->>'composite_score')::numeric < med;

  return coalesce(n, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rating distribution, nine-box migration
-- ---------------------------------------------------------------------------

create or replace function metrics.c3_rating_distribution(filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  snap_asof date;
  result jsonb;
begin
  select max(as_of_date) into snap_asof from public.employee_snapshots where as_of_date <= as_of;

  with pop as (
    select coalesce(s.perf_rating, 'Not rated') as rating
    from metrics.dim_snapshot s
    where s.as_of_date = snap_asof
      and s.employment_status ilike 'active%'
      and metrics.snapshot_in_filters(s, filters)
  ),
  agg as (
    select rating, count(*) as n from pop group by rating
  ),
  total as (select sum(n) as t from agg)
  select coalesce(jsonb_agg(jsonb_build_object(
      'rating', rating, 'n', n,
      'pct', round(100.0 * n / nullif((select t from total), 0), 1),
      'suppressed', n < metrics.min_cell_size()
    ) order by n desc), '[]'::jsonb)
  into result
  from agg;

  return result;
end;
$$;

-- Nine-box placement migration between the latest snapshot and the closest
-- snapshot ~12 months prior, for employees present (and rated) in both.
create or replace function metrics.c3_nine_box_migration(filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  snap_current date;
  snap_prior date;
  result jsonb;
begin
  select max(as_of_date) into snap_current from public.employee_snapshots where as_of_date <= as_of;
  select max(as_of_date) into snap_prior
  from public.employee_snapshots
  where as_of_date <= (as_of - interval '12 months')::date;

  if snap_current is null or snap_prior is null or snap_current = snap_prior then
    return jsonb_build_object(
      'as_of_current', snap_current,
      'as_of_prior', snap_prior,
      'pairs', '[]'::jsonb,
      'note', 'Not enough distinct snapshot dates (need current and ~12 months prior) to compute migration.'
    );
  end if;

  with cur as (
    select employee_id, nine_box_placement as placement
    from metrics.dim_snapshot s
    where s.as_of_date = snap_current
      and s.employment_status ilike 'active%'
      and metrics.snapshot_in_filters(s, filters)
  ),
  prior as (
    select employee_id, nine_box_placement as placement
    from public.employee_snapshots
    where as_of_date = snap_prior
  ),
  paired as (
    select c.employee_id, p.placement as prior_placement, c.placement as current_placement
    from cur c
    join prior p on p.employee_id = c.employee_id
    where p.placement is not null and c.placement is not null
  ),
  agg as (
    select prior_placement, current_placement, count(*) as n
    from paired
    group by prior_placement, current_placement
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'prior_placement', prior_placement,
      'current_placement', current_placement,
      'n', n,
      'suppressed', n < metrics.min_cell_size()
    ) order by n desc), '[]'::jsonb)
  into result
  from agg;

  return jsonb_build_object('as_of_current', snap_current, 'as_of_prior', snap_prior, 'pairs', result);
end;
$$;

-- ---------------------------------------------------------------------------
-- Promotion pipeline
-- ---------------------------------------------------------------------------

-- recommended: distinct employees with a promotion recommendation in the
-- trailing 12 months of performance_reviews.
-- effective: subset of recommended whose latest snapshot shows a promotion
-- took effect recently (months_since_promotion < 12) — i.e. the recommendation
-- shows up downstream in the record.
-- approved_not_effective: recommended but not yet reflected as effective.
create or replace function metrics.c3_promotion_pipeline(filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  window_start date := (as_of - interval '12 months')::date;
  snap_asof date;
  recommended bigint;
  effective bigint;
begin
  select max(as_of_date) into snap_asof from public.employee_snapshots where as_of_date <= as_of;

  with recs_in_scope as materialized (
    select distinct pr.employee_id
    from public.performance_reviews pr
    join metrics.dim_snapshot s on s.employee_id = pr.employee_id and s.as_of_date = snap_asof
    where pr.review_date > window_start and pr.review_date <= as_of
      and lower(coalesce(pr.promotion_recommendation, '')) ~ '(yes|recommend|approv)'
      and metrics.snapshot_in_filters(s, filters)
  )
  select
    count(*),
    count(*) filter (where s2.months_since_promotion is not null and s2.months_since_promotion < 12)
  into recommended, effective
  from recs_in_scope r
  join metrics.dim_snapshot s2 on s2.employee_id = r.employee_id and s2.as_of_date = snap_asof;

  return jsonb_build_object(
    'recommended', coalesce(recommended, 0),
    'effective', coalesce(effective, 0),
    'approved_not_effective', greatest(0, coalesce(recommended, 0) - coalesce(effective, 0))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Succession readiness + bench coverage
-- ---------------------------------------------------------------------------

-- Readiness is an evidence classification derived from the nine-box placement
-- text captured on the snapshot — a simple keyword mapping, not a fitted
-- model. Buckets with fewer than metrics.min_cell_size() employees are
-- suppressed in the response.
create or replace function metrics.readiness_from_nine_box(placement text)
returns text
language sql
immutable
as $$
  select case
    when placement is null then 'Unclassified'
    when placement ilike '%star%' or placement ilike '%high potential%' or placement ilike '%top%' then 'Ready Now'
    when placement ilike '%core%' or placement ilike '%solid%' or placement ilike '%consistent%' then 'Ready 1-2 Years'
    when placement ilike '%inconsistent%' or placement ilike '%enigma%' or placement ilike '%question%' then 'Ready 3-5 Years'
    when placement ilike '%underperform%' or placement ilike '%risk%' then 'Not Ready'
    else 'Unclassified'
  end;
$$;

create or replace function metrics.c3_readiness_distribution(filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  snap_asof date;
  result jsonb;
begin
  select max(as_of_date) into snap_asof from public.employee_snapshots where as_of_date <= as_of;

  with pop as (
    select metrics.readiness_from_nine_box(s.nine_box_placement) as readiness
    from metrics.dim_snapshot s
    where s.as_of_date = snap_asof
      and s.employment_status ilike 'active%'
      and metrics.snapshot_in_filters(s, filters)
  ),
  agg as (
    select readiness, count(*) as n from pop group by readiness
  ),
  total as (select sum(n) as t from agg)
  select coalesce(jsonb_agg(jsonb_build_object(
      'readiness', readiness, 'n', n,
      'pct', round(100.0 * n / nullif((select t from total), 0), 1),
      'suppressed', n < metrics.min_cell_size()
    ) order by n desc), '[]'::jsonb)
  into result
  from agg;

  return result;
end;
$$;

-- Bench coverage: the source data has no explicit successor-designation
-- field, so coverage is approximated with high-potential nine-box placements
-- as a directional proxy for succession-ready bench strength against active
-- manager positions. This thinness is called out explicitly in data_note.
create or replace function metrics.c3_bench_coverage(filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  snap_asof date;
  active_n bigint;
  proxy_successor_n bigint;
  manager_positions bigint;
  result jsonb;
begin
  select max(as_of_date) into snap_asof from public.employee_snapshots where as_of_date <= as_of;

  select count(*) into active_n
  from metrics.dim_snapshot s
  where s.as_of_date = snap_asof and s.employment_status ilike 'active%'
    and metrics.snapshot_in_filters(s, filters);

  select count(*) into proxy_successor_n
  from metrics.dim_snapshot s
  where s.as_of_date = snap_asof and s.employment_status ilike 'active%'
    and metrics.snapshot_in_filters(s, filters)
    and metrics.readiness_from_nine_box(s.nine_box_placement) = 'Ready Now';

  select count(*) into manager_positions
  from metrics.dim_snapshot s
  join public.level_map lm on lm.meridian_level = s.career_level
  where s.as_of_date = snap_asof and s.employment_status ilike 'active%'
    and metrics.snapshot_in_filters(s, filters)
    and lm.is_manager;

  result := jsonb_build_object(
    'active_headcount', coalesce(active_n, 0),
    'proxy_successor_count', coalesce(proxy_successor_n, 0),
    'manager_positions', coalesce(manager_positions, 0),
    'proxy_successor_coverage_ratio', case when coalesce(manager_positions, 0) = 0 then null
      else round(coalesce(proxy_successor_n, 0)::numeric / manager_positions, 2) end,
    'proxy_successor_pct_of_active', case when coalesce(active_n, 0) = 0 then null
      else round(100.0 * coalesce(proxy_successor_n, 0) / active_n, 1) end,
    'suppressed', coalesce(active_n, 0) < metrics.min_cell_size(),
    'data_note', 'No explicit successor-designation field exists in the source data. Bench coverage is approximated using nine-box placements that indicate high potential (Star / High Potential / Top) as a proxy for succession-ready bench strength; treat as directional, not a formal succession count.'
  );
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Drill-through
-- ---------------------------------------------------------------------------

create or replace function metrics.c3_manager_detail(p_manager_id text, filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  snap_asof date;
  manager_row jsonb;
  team jsonb;
  effectiveness jsonb;
  this_manager jsonb;
begin
  select max(as_of_date) into snap_asof from public.employee_snapshots where as_of_date <= as_of;

  select to_jsonb(s) into manager_row
  from metrics.dim_snapshot s
  where s.employee_id = p_manager_id and s.as_of_date = snap_asof;

  select coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', s.employee_id,
      'career_level', s.career_level,
      'function_name', s.function_name,
      'tenure_months', s.tenure_months,
      'tenure_band', s.tenure_band,
      'perf_rating', s.perf_rating,
      'nine_box_placement', s.nine_box_placement,
      'engagement_score', s.engagement_score,
      'flight_risk_rating', s.flight_risk_rating,
      'months_since_promotion', s.months_since_promotion
    )), '[]'::jsonb)
  into team
  from metrics.dim_snapshot s
  where s.manager_employee_id = p_manager_id
    and s.as_of_date = snap_asof
    and s.employment_status ilike 'active%';

  effectiveness := metrics.c3_manager_effectiveness(filters);
  select m into this_manager
  from jsonb_array_elements(effectiveness) m
  where m->>'manager_id' = p_manager_id
  limit 1;

  return jsonb_build_object(
    'manager_id', p_manager_id,
    'manager_snapshot', manager_row,
    'team_roster', team,
    'effectiveness', this_manager
  );
end;
$$;

-- Employee 360 drill-through: full risk score breakdown + recent history.
-- employee_snapshots carries no gender/race_ethnicity columns; the explicit
-- key removal below documents that intent even though it is a no-op today.
create or replace function metrics.c3_employee_360(p_employee_id text)
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  snap_asof date;
  snapshot_row jsonb;
  risk jsonb;
  recent_engagement jsonb;
  recent_reviews jsonb;
  recent_comp jsonb;
  recent_org_events jsonb;
begin
  select max(as_of_date) into snap_asof from public.employee_snapshots where as_of_date <= as_of;

  select to_jsonb(s) - 'gender' - 'race_ethnicity' into snapshot_row
  from metrics.dim_snapshot s
  where s.employee_id = p_employee_id and s.as_of_date = snap_asof;

  risk := metrics.attrition_risk_score(p_employee_id, as_of);

  select coalesce(jsonb_agg(jsonb_build_object(
      'observation_date', observation_date, 'engagement_score', engagement_score
    ) order by observation_date desc), '[]'::jsonb)
  into recent_engagement
  from (
    select observation_date, engagement_score
    from public.engagement_score_history
    where employee_id = p_employee_id
    order by observation_date desc
    limit 8
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
      'review_date', review_date, 'rating', rating,
      'calibrated_rating', calibrated_rating, 'promotion_recommendation', promotion_recommendation
    ) order by review_date desc), '[]'::jsonb)
  into recent_reviews
  from (
    select review_date, rating, calibrated_rating, promotion_recommendation
    from public.performance_reviews
    where employee_id = p_employee_id
    order by review_date desc
    limit 6
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
      'event_date', event_date, 'event_type', event_type, 'merit_percent', merit_percent
    ) order by event_date desc), '[]'::jsonb)
  into recent_comp
  from (
    select event_date, event_type, merit_percent
    from public.compensation_events
    where employee_id = p_employee_id
    order by event_date desc
    limit 6
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
      'event_date', event_date, 'event_type', event_type, 'prior_value', prior_value, 'new_value', new_value
    ) order by event_date desc), '[]'::jsonb)
  into recent_org_events
  from (
    select event_date, event_type, prior_value, new_value
    from public.org_events
    where employee_id = p_employee_id
    order by event_date desc
    limit 10
  ) x;

  return jsonb_build_object(
    'employee_id', p_employee_id,
    'snapshot', snapshot_row,
    'risk_score', risk,
    'recent_engagement', recent_engagement,
    'recent_performance_reviews', recent_reviews,
    'recent_compensation_events', recent_comp,
    'recent_org_events', recent_org_events
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
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
  end if;
  if exists (select 1 from pg_roles where rolname = 'meridian_wizard') then
    execute 'grant usage on schema metrics to meridian_wizard';
    execute 'grant select on all tables in schema metrics to meridian_wizard';
    execute 'grant execute on all functions in schema metrics to meridian_wizard';
  end if;
end $$;
