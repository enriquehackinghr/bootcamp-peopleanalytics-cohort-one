-- Class 3 semantic layer: attrition, hazard, cohort survival, retention drivers,
-- org-event association measures, and exit-interview coded drivers.
--
-- Association language only: rates and "drivers" below describe correlation in the
-- observed data, not fitted/causal models. No ML models are trained in this file.

create schema if not exists metrics;

-- ---------------------------------------------------------------------------
-- reporting_as_of(): extend to also look at Class 3 storage tables
-- ---------------------------------------------------------------------------

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
      union all
      select max(as_of_date) from public.employee_snapshots
      union all
      select max(termination_date) from public.termination_history
      union all
      select max(observation_date) from public.engagement_score_history
      union all
      select max(event_date) from public.org_events
    ) x),
    current_date
  );
$$;

-- ---------------------------------------------------------------------------
-- Helpers / constants
-- ---------------------------------------------------------------------------

-- Minimum reportable cell size for the sparser Class 3 hazard/cohort cuts.
-- Kept distinct from metrics.min_cell_size() (5) because hazard bands and
-- cohort-survival cells are more sensitive to small-n noise.
create or replace function metrics.min_cell_size_hazard()
returns integer
language sql
immutable
as $$ select 10 $$;

-- Same 4 bands as metrics.tenure_band()/UI tenureBands filter, but computed
-- from a tenure-in-months figure (employee_snapshots.tenure_months,
-- termination_history.tenure_months_at_exit) instead of hire_date/as_of.
create or replace function metrics.tenure_band_from_months(tenure_months numeric)
returns text
language sql
immutable
as $$
  select case
    when tenure_months is null then 'Unknown'
    when tenure_months < 12 then '0-1 years'
    when tenure_months < 24 then '1-2 years'
    when tenure_months < 60 then '2-5 years'
    else '5+ years'
  end;
$$;

-- Finer-grained bands used only for the tenure hazard curve (metrics.c3_tenure_hazard).
create or replace function metrics.hazard_band_from_months(tenure_months numeric)
returns text
language sql
immutable
as $$
  select case
    when tenure_months is null then 'Unknown'
    when tenure_months < 6 then '0-6 months'
    when tenure_months < 12 then '6-12 months'
    when tenure_months < 24 then '12-24 months'
    when tenure_months < 36 then '24-36 months'
    when tenure_months < 60 then '36-60 months'
    else '60+ months'
  end;
$$;

create or replace function metrics.hazard_band_rank(band text)
returns integer
language sql
immutable
as $$
  select case band
    when '0-6 months' then 1
    when '6-12 months' then 2
    when '12-24 months' then 3
    when '24-36 months' then 4
    when '36-60 months' then 5
    when '60+ months' then 6
    else 99
  end;
$$;

create or replace function metrics.compa_band(compa numeric)
returns text
language sql
immutable
as $$
  select case
    when compa is null then 'Unknown'
    when compa < 0.85 then '<0.85'
    when compa < 0.95 then '0.85-0.95'
    when compa < 1.05 then '0.95-1.05'
    when compa < 1.15 then '1.05-1.15'
    else '1.15+'
  end;
$$;

-- Per-employee engagement instrument is 0-10 (see employee_snapshots.engagement_score /
-- engagement_score_history.engagement_score) — never share an axis with the 1-5 survey mean.
create or replace function metrics.engagement_band(score numeric)
returns text
language sql
immutable
as $$
  select case
    when score is null then 'Unknown'
    when score < 4 then 'Low (<4)'
    when score < 6 then 'Moderate (4-6)'
    when score < 8 then 'Good (6-8)'
    else 'High (8-10)'
  end;
$$;

create or replace function metrics.mobility_gap_band(months_since_promotion numeric)
returns text
language sql
immutable
as $$
  select case
    when months_since_promotion is null then 'No promotion on record'
    when months_since_promotion < 12 then '<12 months'
    when months_since_promotion < 24 then '12-24 months'
    when months_since_promotion < 36 then '24-36 months'
    else '36+ months'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Conformed snapshot dimension + filter predicate
-- ---------------------------------------------------------------------------

create or replace view metrics.dim_snapshot as
select
  s.snapshot_id,
  s.as_of_date,
  s.employee_id,
  s.in_employee_master,
  s.employment_status,
  s.function_name,
  s.department,
  s.career_level,
  lm.apex_level,
  lm.level_band,
  s.career_track,
  s.job_family,
  s.manager_employee_id,
  s.office_location,
  s.work_country,
  s.pay_zone,
  s.work_arrangement,
  s.currency_code,
  s.base_salary,
  s.salary_range_mid,
  s.compa_ratio,
  s.range_penetration,
  s.perf_rating,
  s.nine_box_placement,
  s.engagement_score,
  s.flight_risk_rating,
  s.tenure_months,
  metrics.tenure_band_from_months(s.tenure_months) as tenure_band,
  s.direct_reports,
  s.months_since_promotion,
  s.org_events_last_6m
from public.employee_snapshots s
left join public.level_map lm on lm.meridian_level = s.career_level;

grant select on metrics.dim_snapshot to meridian_app, meridian_wizard;

-- Mirrors metrics.employee_in_filters() but reads Class 3 snapshot columns
-- (office_location / work_country instead of office / country).
create or replace function metrics.snapshot_in_filters(snap metrics.dim_snapshot, filters jsonb)
returns boolean
language sql
stable
as $$
  select
    (
      coalesce(jsonb_array_length(filters->'functions'), 0) = 0
      or snap.function_name in (select jsonb_array_elements_text(filters->'functions'))
    )
    and (
      coalesce(jsonb_array_length(filters->'locations'), 0) = 0
      or snap.office_location in (select jsonb_array_elements_text(filters->'locations'))
      or snap.work_country in (select jsonb_array_elements_text(filters->'locations'))
    )
    and (
      coalesce(jsonb_array_length(filters->'levelBands'), 0) = 0
      or snap.level_band in (select jsonb_array_elements_text(filters->'levelBands'))
      or snap.career_level in (select jsonb_array_elements_text(filters->'levelBands'))
    )
    and (
      coalesce(jsonb_array_length(filters->'tenureBands'), 0) = 0
      or snap.tenure_band in (select jsonb_array_elements_text(filters->'tenureBands'))
    );
$$;

-- ---------------------------------------------------------------------------
-- Termination context: termination_history enriched with the nearest known
-- snapshot for the same employee (used because termination_history does not
-- carry work_arrangement / engagement_score / months_since_promotion, which
-- several Class 3 measures need at (or just before) the exit date).
-- ---------------------------------------------------------------------------

create or replace view metrics.dim_termination_context as
select
  th.termination_id,
  th.employee_id,
  th.in_employee_master,
  th.hire_date,
  th.termination_date,
  th.fiscal_year,
  th.termination_type,
  th.termination_reason,
  th.tenure_months_at_exit,
  th.tenure_band_at_exit,
  th.function_name,
  th.department,
  th.career_level,
  th.career_track,
  th.job_family,
  th.office_location,
  th.work_country,
  th.pay_zone,
  th.manager_employee_id,
  th.currency_code,
  th.compa_ratio_at_exit,
  th.last_perf_rating,
  th.talent_designation,
  th.rehire_eligible,
  ctx.compa_ratio as ctx_compa_ratio,
  ctx.engagement_score as ctx_engagement_score,
  ctx.months_since_promotion as ctx_months_since_promotion,
  ctx.work_arrangement as ctx_work_arrangement,
  ctx.perf_rating as ctx_perf_rating,
  ctx.level_band as ctx_level_band,
  ctx.tenure_band as ctx_tenure_band
from public.termination_history th
left join lateral (
  select s.*
  from metrics.dim_snapshot s
  where s.employee_id = th.employee_id
  order by
    (case when s.as_of_date <= th.termination_date then 0 else 1 end),
    abs(s.as_of_date - th.termination_date) asc
  limit 1
) ctx on true;

grant select on metrics.dim_termination_context to meridian_app, meridian_wizard;

create or replace function metrics.termination_in_filters(term metrics.dim_termination_context, filters jsonb)
returns boolean
language sql
stable
as $$
  select
    (
      coalesce(jsonb_array_length(filters->'functions'), 0) = 0
      or term.function_name in (select jsonb_array_elements_text(filters->'functions'))
    )
    and (
      coalesce(jsonb_array_length(filters->'locations'), 0) = 0
      or term.office_location in (select jsonb_array_elements_text(filters->'locations'))
      or term.work_country in (select jsonb_array_elements_text(filters->'locations'))
    )
    and (
      coalesce(jsonb_array_length(filters->'levelBands'), 0) = 0
      or term.career_level in (select jsonb_array_elements_text(filters->'levelBands'))
      or term.ctx_level_band in (select jsonb_array_elements_text(filters->'levelBands'))
    )
    and (
      coalesce(jsonb_array_length(filters->'tenureBands'), 0) = 0
      or term.tenure_band_at_exit in (select jsonb_array_elements_text(filters->'tenureBands'))
      or term.ctx_tenure_band in (select jsonb_array_elements_text(filters->'tenureBands'))
    );
$$;

-- ---------------------------------------------------------------------------
-- Org event context: org_events enriched with the nearest snapshot, used to
-- scope org-event association measures to the standard filter set.
-- ---------------------------------------------------------------------------

create or replace view metrics.dim_org_event_context as
select
  oe.event_id,
  oe.employee_id,
  oe.event_date,
  oe.event_type,
  oe.prior_value,
  oe.new_value,
  oe.direction,
  oe.pct_change,
  oe.reorg_scope,
  oe.initiated_by,
  ctx.function_name as ctx_function_name,
  ctx.career_level as ctx_career_level,
  ctx.level_band as ctx_level_band,
  ctx.office_location as ctx_office_location,
  ctx.work_country as ctx_work_country,
  ctx.tenure_band as ctx_tenure_band
from public.org_events oe
left join lateral (
  select s.*
  from metrics.dim_snapshot s
  where s.employee_id = oe.employee_id
  order by
    (case when s.as_of_date <= oe.event_date then 0 else 1 end),
    abs(s.as_of_date - oe.event_date) asc
  limit 1
) ctx on true;

grant select on metrics.dim_org_event_context to meridian_app, meridian_wizard;

create or replace function metrics.org_event_in_filters(evt metrics.dim_org_event_context, filters jsonb)
returns boolean
language sql
stable
as $$
  select
    (
      coalesce(jsonb_array_length(filters->'functions'), 0) = 0
      or evt.ctx_function_name in (select jsonb_array_elements_text(filters->'functions'))
    )
    and (
      coalesce(jsonb_array_length(filters->'locations'), 0) = 0
      or evt.ctx_office_location in (select jsonb_array_elements_text(filters->'locations'))
      or evt.ctx_work_country in (select jsonb_array_elements_text(filters->'locations'))
    )
    and (
      coalesce(jsonb_array_length(filters->'levelBands'), 0) = 0
      or evt.ctx_level_band in (select jsonb_array_elements_text(filters->'levelBands'))
      or evt.ctx_career_level in (select jsonb_array_elements_text(filters->'levelBands'))
    )
    and (
      coalesce(jsonb_array_length(filters->'tenureBands'), 0) = 0
      or evt.ctx_tenure_band in (select jsonb_array_elements_text(filters->'tenureBands'))
    );
$$;

-- ---------------------------------------------------------------------------
-- Voluntary / involuntary attrition (Class 3 storage-table sourced)
-- ---------------------------------------------------------------------------

create or replace function metrics.c3_voluntary_attrition_rate(filters jsonb default '{}'::jsonb)
returns numeric
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  window_start date := (as_of - interval '12 months')::date;
  voluntary_terms numeric;
  start_snap date;
  end_snap date;
  start_hc numeric;
  end_hc numeric;
  avg_hc numeric;
begin
  select count(*)::numeric into voluntary_terms
  from metrics.dim_termination_context th
  where lower(coalesce(th.termination_type, '')) = 'voluntary'
    and th.termination_date is not null
    and th.termination_date > window_start
    and th.termination_date <= as_of
    and metrics.termination_in_filters(th, filters);

  select max(as_of_date) into start_snap from public.employee_snapshots where as_of_date <= window_start;
  select max(as_of_date) into end_snap from public.employee_snapshots where as_of_date <= as_of;

  select count(*)::numeric into start_hc
  from metrics.dim_snapshot s
  where s.as_of_date = start_snap
    and s.employment_status ilike 'active%'
    and metrics.snapshot_in_filters(s, filters);

  select count(*)::numeric into end_hc
  from metrics.dim_snapshot s
  where s.as_of_date = end_snap
    and s.employment_status ilike 'active%'
    and metrics.snapshot_in_filters(s, filters);

  if coalesce(start_hc, 0) = 0 then
    start_hc := end_hc;
  end if;
  if coalesce(end_hc, 0) = 0 then
    end_hc := start_hc;
  end if;

  avg_hc := nullif((coalesce(start_hc, 0) + coalesce(end_hc, 0)) / 2.0, 0);

  if avg_hc is null then
    return 0;
  end if;
  return round((voluntary_terms / avg_hc) * 100.0, 1);
end;
$$;

create or replace function metrics.c3_involuntary_attrition_rate(filters jsonb default '{}'::jsonb)
returns numeric
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  window_start date := (as_of - interval '12 months')::date;
  involuntary_terms numeric;
  start_snap date;
  end_snap date;
  start_hc numeric;
  end_hc numeric;
  avg_hc numeric;
begin
  select count(*)::numeric into involuntary_terms
  from metrics.dim_termination_context th
  where lower(coalesce(th.termination_type, '')) = 'involuntary'
    and th.termination_date is not null
    and th.termination_date > window_start
    and th.termination_date <= as_of
    and metrics.termination_in_filters(th, filters);

  select max(as_of_date) into start_snap from public.employee_snapshots where as_of_date <= window_start;
  select max(as_of_date) into end_snap from public.employee_snapshots where as_of_date <= as_of;

  select count(*)::numeric into start_hc
  from metrics.dim_snapshot s
  where s.as_of_date = start_snap
    and s.employment_status ilike 'active%'
    and metrics.snapshot_in_filters(s, filters);

  select count(*)::numeric into end_hc
  from metrics.dim_snapshot s
  where s.as_of_date = end_snap
    and s.employment_status ilike 'active%'
    and metrics.snapshot_in_filters(s, filters);

  if coalesce(start_hc, 0) = 0 then
    start_hc := end_hc;
  end if;
  if coalesce(end_hc, 0) = 0 then
    end_hc := start_hc;
  end if;

  avg_hc := nullif((coalesce(start_hc, 0) + coalesce(end_hc, 0)) / 2.0, 0);

  if avg_hc is null then
    return 0;
  end if;
  return round((involuntary_terms / avg_hc) * 100.0, 1);
end;
$$;

-- Regrettable attrition: shows the derived proxy (performance/talent signal on
-- termination_history) side-by-side with the stated exit-interview flag, plus
-- how often the two agree — never blends the two into a single number.
create or replace function metrics.c3_regrettable_attrition(filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  window_start date := (as_of - interval '12 months')::date;
  derived_count bigint;
  exit_flag_count bigint;
  agreement_count bigint;
  disagreement_count bigint;
begin
  select count(*) into derived_count
  from metrics.dim_termination_context th
  where lower(coalesce(th.termination_type, '')) = 'voluntary'
    and th.termination_date > window_start
    and th.termination_date <= as_of
    and metrics.termination_in_filters(th, filters)
    and (
      th.last_perf_rating in ('Exceeded', 'Significantly Exceeded', 'Exceeds Expectations')
      or th.talent_designation in ('Top Talent', 'Strong Performer')
    );

  select count(*) into exit_flag_count
  from public.exit_interviews ei
  join metrics.dim_termination_context th
    on th.employee_id = ei.employee_id and th.termination_date = ei.termination_date
  where lower(coalesce(ei.regrettable_flag, '')) in ('yes', 'true', '1')
    and ei.termination_date > window_start
    and ei.termination_date <= as_of
    and metrics.termination_in_filters(th, filters);

  with matched as (
    select
      (
        th.last_perf_rating in ('Exceeded', 'Significantly Exceeded', 'Exceeds Expectations')
        or th.talent_designation in ('Top Talent', 'Strong Performer')
      ) as derived_flag,
      lower(coalesce(ei.regrettable_flag, '')) in ('yes', 'true', '1') as exit_flag
    from metrics.dim_termination_context th
    join public.exit_interviews ei
      on ei.employee_id = th.employee_id and ei.termination_date = th.termination_date
    where lower(coalesce(th.termination_type, '')) = 'voluntary'
      and th.termination_date > window_start
      and th.termination_date <= as_of
      and metrics.termination_in_filters(th, filters)
  )
  select
    count(*) filter (where derived_flag and exit_flag),
    count(*) filter (where derived_flag <> exit_flag)
  into agreement_count, disagreement_count
  from matched;

  return jsonb_build_object(
    'derived_count', coalesce(derived_count, 0),
    'exit_flag_count', coalesce(exit_flag_count, 0),
    'agreement_count', coalesce(agreement_count, 0),
    'disagreement_count', coalesce(disagreement_count, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Attrition by cut (function | level | location | tenure_band | work_arrangement)
-- ---------------------------------------------------------------------------

create or replace function metrics.c3_attrition_by_cut(filters jsonb default '{}'::jsonb, cut text default 'function')
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  window_start date := (as_of - interval '12 months')::date;
  snap_asof date;
  exit_expr text;
  pop_expr text;
  result jsonb;
begin
  select max(as_of_date) into snap_asof from public.employee_snapshots where as_of_date <= as_of;

  if cut = 'function' then
    exit_expr := 'coalesce(ctx.function_name, ''Unknown'')';
    pop_expr := 'coalesce(s.function_name, ''Unknown'')';
  elsif cut = 'level' then
    exit_expr := 'coalesce(ctx.career_level, ''Unknown'')';
    pop_expr := 'coalesce(s.career_level, ''Unknown'')';
  elsif cut = 'location' then
    exit_expr := 'coalesce(ctx.office_location, ''Unknown'')';
    pop_expr := 'coalesce(s.office_location, ''Unknown'')';
  elsif cut = 'tenure_band' then
    exit_expr := 'coalesce(ctx.tenure_band_at_exit, ''Unknown'')';
    pop_expr := 'coalesce(s.tenure_band, ''Unknown'')';
  elsif cut = 'work_arrangement' then
    exit_expr := 'coalesce(ctx.ctx_work_arrangement, ''Unknown'')';
    pop_expr := 'coalesce(s.work_arrangement, ''Unknown'')';
  else
    raise exception 'Unsupported cut: % (expected function|level|location|tenure_band|work_arrangement)', cut;
  end if;

  execute format(
    $f$
      with exits as (
        select %1$s as cut_value, count(*)::bigint as voluntary_count
        from metrics.dim_termination_context ctx
        where lower(coalesce(ctx.termination_type, '')) = 'voluntary'
          and ctx.termination_date > $1 and ctx.termination_date <= $2
          and metrics.termination_in_filters(ctx, $3)
        group by 1
      ),
      pop as (
        select %2$s as cut_value, count(*)::bigint as n
        from metrics.dim_snapshot s
        where s.as_of_date = $4
          and s.employment_status ilike 'active%%'
          and metrics.snapshot_in_filters(s, $3)
        group by 1
      )
      select coalesce(jsonb_agg(jsonb_build_object(
          'cut_value', coalesce(e.cut_value, p.cut_value),
          'voluntary_count', coalesce(e.voluntary_count, 0),
          'n', coalesce(p.n, 0),
          'rate', case when coalesce(p.n, 0) = 0 then null
                       else round(100.0 * coalesce(e.voluntary_count, 0) / p.n, 1) end,
          'suppressed', coalesce(p.n, 0) < metrics.min_cell_size()
        ) order by coalesce(p.n, 0) desc), '[]'::jsonb)
      from exits e
      full outer join pop p on e.cut_value = p.cut_value
    $f$,
    exit_expr,
    pop_expr
  )
  into result
  using window_start, as_of, filters, snap_asof;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenure hazard (empirical, not a fitted survival model): trailing-12-month
-- voluntary exit rate observed within each tenure band, exposure from the
-- latest snapshot.
-- ---------------------------------------------------------------------------

create or replace function metrics.c3_tenure_hazard(filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  window_start date := (as_of - interval '12 months')::date;
  snap_asof date;
  result jsonb;
begin
  select max(as_of_date) into snap_asof from public.employee_snapshots where as_of_date <= as_of;

  with exposed as (
    select metrics.hazard_band_from_months(s.tenure_months) as band, count(*)::bigint as exposed
    from metrics.dim_snapshot s
    where s.as_of_date = snap_asof
      and s.employment_status ilike 'active%'
      and metrics.snapshot_in_filters(s, filters)
    group by 1
  ),
  exits as (
    select metrics.hazard_band_from_months(ctx.tenure_months_at_exit) as band, count(*)::bigint as exits
    from metrics.dim_termination_context ctx
    where lower(coalesce(ctx.termination_type, '')) = 'voluntary'
      and ctx.termination_date > window_start
      and ctx.termination_date <= as_of
      and metrics.termination_in_filters(ctx, filters)
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'band', coalesce(e.band, x.band),
      'exposed', coalesce(e.exposed, 0),
      'exits', coalesce(x.exits, 0),
      'rate', case when coalesce(e.exposed, 0) = 0 then null
                   else round(100.0 * coalesce(x.exits, 0) / e.exposed, 1) end,
      'suppressed', coalesce(e.exposed, 0) < metrics.min_cell_size_hazard()
    ) order by metrics.hazard_band_rank(coalesce(e.band, x.band))), '[]'::jsonb)
  into result
  from exposed e
  full outer join exits x on e.band = x.band;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cohort survival: hire-year cohorts, % reaching 12/24/36 months either still
-- active or exited at/after that milestone. Milestones are null until the
-- entire cohort year could possibly have reached them (worst-case Dec 31 hire).
-- ---------------------------------------------------------------------------

create or replace function metrics.c3_cohort_survival(filters jsonb default '{}'::jsonb)
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

  with cohort as (
    select
      s.employee_id,
      extract(year from (s.as_of_date - make_interval(months => round(s.tenure_months)::int)))::int as hire_year,
      s.tenure_months as months_observed,
      false as exited
    from metrics.dim_snapshot s
    where s.as_of_date = snap_asof
      and s.employment_status ilike 'active%'
      and s.tenure_months is not null
      and metrics.snapshot_in_filters(s, filters)
    union all
    select
      ctx.employee_id,
      extract(year from ctx.hire_date)::int as hire_year,
      ctx.tenure_months_at_exit as months_observed,
      true as exited
    from metrics.dim_termination_context ctx
    where ctx.hire_date is not null
      and ctx.tenure_months_at_exit is not null
      and metrics.termination_in_filters(ctx, filters)
  ),
  by_year as (
    select
      hire_year,
      count(*)::bigint as n,
      (as_of - make_date(hire_year, 12, 31))::numeric / 30.44 as months_elapsed_worst_case,
      count(*) filter (where not exited or months_observed >= 12) as survived_12,
      count(*) filter (where not exited or months_observed >= 24) as survived_24,
      count(*) filter (where not exited or months_observed >= 36) as survived_36
    from cohort
    group by hire_year
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'hire_year', hire_year,
      'n', n,
      'm12', case when months_elapsed_worst_case < 12 then null else round(100.0 * survived_12 / nullif(n, 0), 1) end,
      'm24', case when months_elapsed_worst_case < 24 then null else round(100.0 * survived_24 / nullif(n, 0), 1) end,
      'm36', case when months_elapsed_worst_case < 36 then null else round(100.0 * survived_36 / nullif(n, 0), 1) end,
      'suppressed', n < metrics.min_cell_size_hazard()
    ) order by hire_year desc), '[]'::jsonb)
  into result
  from by_year;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention drivers: exit rate by band vs. the company baseline. "pp_delta" is
-- the percentage-point gap vs. the trailing voluntary attrition rate — an
-- association, not a causal estimate.
-- ---------------------------------------------------------------------------

create or replace function metrics.c3_exit_rate_by_compa_band(filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  window_start date := (as_of - interval '12 months')::date;
  snap_asof date;
  base_rate numeric;
  result jsonb;
begin
  select max(as_of_date) into snap_asof from public.employee_snapshots where as_of_date <= as_of;
  base_rate := metrics.c3_voluntary_attrition_rate(filters);

  with pop as (
    select metrics.compa_band(s.compa_ratio) as band, count(*)::bigint as n
    from metrics.dim_snapshot s
    where s.as_of_date = snap_asof and s.employment_status ilike 'active%'
      and metrics.snapshot_in_filters(s, filters)
    group by 1
  ),
  exits as (
    select metrics.compa_band(ctx.ctx_compa_ratio) as band, count(*)::bigint as voluntary_count
    from metrics.dim_termination_context ctx
    where lower(coalesce(ctx.termination_type, '')) = 'voluntary'
      and ctx.termination_date > window_start and ctx.termination_date <= as_of
      and metrics.termination_in_filters(ctx, filters)
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'band', coalesce(p.band, e.band),
      'rate', case when coalesce(p.n, 0) = 0 then null else round(100.0 * coalesce(e.voluntary_count, 0) / p.n, 1) end,
      'base_rate', base_rate,
      'pp_delta', case when coalesce(p.n, 0) = 0 then null
                       else round((100.0 * coalesce(e.voluntary_count, 0) / p.n) - base_rate, 1) end,
      'n', coalesce(p.n, 0),
      'suppressed', coalesce(p.n, 0) < metrics.min_cell_size()
    )), '[]'::jsonb)
  into result
  from pop p
  full outer join exits e on p.band = e.band;

  return result;
end;
$$;

create or replace function metrics.c3_exit_rate_by_engagement_band(filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  window_start date := (as_of - interval '12 months')::date;
  snap_asof date;
  base_rate numeric;
  result jsonb;
begin
  select max(as_of_date) into snap_asof from public.employee_snapshots where as_of_date <= as_of;
  base_rate := metrics.c3_voluntary_attrition_rate(filters);

  with pop as (
    select metrics.engagement_band(s.engagement_score) as band, count(*)::bigint as n
    from metrics.dim_snapshot s
    where s.as_of_date = snap_asof and s.employment_status ilike 'active%'
      and metrics.snapshot_in_filters(s, filters)
    group by 1
  ),
  exits as (
    select metrics.engagement_band(ctx.ctx_engagement_score) as band, count(*)::bigint as voluntary_count
    from metrics.dim_termination_context ctx
    where lower(coalesce(ctx.termination_type, '')) = 'voluntary'
      and ctx.termination_date > window_start and ctx.termination_date <= as_of
      and metrics.termination_in_filters(ctx, filters)
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'band', coalesce(p.band, e.band),
      'rate', case when coalesce(p.n, 0) = 0 then null else round(100.0 * coalesce(e.voluntary_count, 0) / p.n, 1) end,
      'base_rate', base_rate,
      'pp_delta', case when coalesce(p.n, 0) = 0 then null
                       else round((100.0 * coalesce(e.voluntary_count, 0) / p.n) - base_rate, 1) end,
      'n', coalesce(p.n, 0),
      'suppressed', coalesce(p.n, 0) < metrics.min_cell_size()
    )), '[]'::jsonb)
  into result
  from pop p
  full outer join exits e on p.band = e.band;

  return result;
end;
$$;

create or replace function metrics.c3_exit_rate_by_mobility_gap(filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  window_start date := (as_of - interval '12 months')::date;
  snap_asof date;
  base_rate numeric;
  result jsonb;
begin
  select max(as_of_date) into snap_asof from public.employee_snapshots where as_of_date <= as_of;
  base_rate := metrics.c3_voluntary_attrition_rate(filters);

  with pop as (
    select metrics.mobility_gap_band(s.months_since_promotion) as band, count(*)::bigint as n
    from metrics.dim_snapshot s
    where s.as_of_date = snap_asof and s.employment_status ilike 'active%'
      and metrics.snapshot_in_filters(s, filters)
    group by 1
  ),
  exits as (
    select metrics.mobility_gap_band(ctx.ctx_months_since_promotion) as band, count(*)::bigint as voluntary_count
    from metrics.dim_termination_context ctx
    where lower(coalesce(ctx.termination_type, '')) = 'voluntary'
      and ctx.termination_date > window_start and ctx.termination_date <= as_of
      and metrics.termination_in_filters(ctx, filters)
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'band', coalesce(p.band, e.band),
      'rate', case when coalesce(p.n, 0) = 0 then null else round(100.0 * coalesce(e.voluntary_count, 0) / p.n, 1) end,
      'base_rate', base_rate,
      'pp_delta', case when coalesce(p.n, 0) = 0 then null
                       else round((100.0 * coalesce(e.voluntary_count, 0) / p.n) - base_rate, 1) end,
      'n', coalesce(p.n, 0),
      'suppressed', coalesce(p.n, 0) < metrics.min_cell_size()
    )), '[]'::jsonb)
  into result
  from pop p
  full outer join exits e on p.band = e.band;

  return result;
end;
$$;

create or replace function metrics.c3_exit_rate_by_tenure_band(filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  window_start date := (as_of - interval '12 months')::date;
  snap_asof date;
  base_rate numeric;
  result jsonb;
begin
  select max(as_of_date) into snap_asof from public.employee_snapshots where as_of_date <= as_of;
  base_rate := metrics.c3_voluntary_attrition_rate(filters);

  with pop as (
    select s.tenure_band as band, count(*)::bigint as n
    from metrics.dim_snapshot s
    where s.as_of_date = snap_asof and s.employment_status ilike 'active%'
      and metrics.snapshot_in_filters(s, filters)
    group by 1
  ),
  exits as (
    select metrics.tenure_band_from_months(ctx.tenure_months_at_exit) as band, count(*)::bigint as voluntary_count
    from metrics.dim_termination_context ctx
    where lower(coalesce(ctx.termination_type, '')) = 'voluntary'
      and ctx.termination_date > window_start and ctx.termination_date <= as_of
      and metrics.termination_in_filters(ctx, filters)
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'band', coalesce(p.band, e.band),
      'rate', case when coalesce(p.n, 0) = 0 then null else round(100.0 * coalesce(e.voluntary_count, 0) / p.n, 1) end,
      'base_rate', base_rate,
      'pp_delta', case when coalesce(p.n, 0) = 0 then null
                       else round((100.0 * coalesce(e.voluntary_count, 0) / p.n) - base_rate, 1) end,
      'n', coalesce(p.n, 0),
      'suppressed', coalesce(p.n, 0) < metrics.min_cell_size()
    )), '[]'::jsonb)
  into result
  from pop p
  full outer join exits e on p.band = e.band;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Org-event association measures: voluntary exit rate in the 6 months before
-- vs. after a qualifying event, for employees who experienced it. Illustrative
-- before/after comparison — not a causal estimate of the event's effect.
-- ---------------------------------------------------------------------------

create or replace function metrics._c3_org_event_measure(filters jsonb, event_patterns text[])
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  window_days int := 182;
  base_rate numeric;
  n bigint;
  before_exits bigint;
  after_exits bigint;
begin
  base_rate := metrics.c3_voluntary_attrition_rate(filters);

  with qualifying_events as (
    select distinct on (oe.employee_id)
      oe.employee_id,
      oe.event_date
    from metrics.dim_org_event_context oe
    where oe.event_type ilike any (event_patterns)
      and oe.event_date is not null
      and (oe.event_date + window_days) <= as_of
      and oe.event_date >= (as_of - interval '30 months')::date
      and metrics.org_event_in_filters(oe, filters)
    order by oe.employee_id, oe.event_date desc
  ),
  outcomes as (
    select
      qe.employee_id,
      exists (
        select 1 from public.termination_history th
        where th.employee_id = qe.employee_id
          and lower(coalesce(th.termination_type, '')) = 'voluntary'
          and th.termination_date > (qe.event_date - window_days)
          and th.termination_date <= qe.event_date
      ) as exited_before,
      exists (
        select 1 from public.termination_history th
        where th.employee_id = qe.employee_id
          and lower(coalesce(th.termination_type, '')) = 'voluntary'
          and th.termination_date > qe.event_date
          and th.termination_date <= (qe.event_date + window_days)
      ) as exited_after
    from qualifying_events qe
  )
  select
    count(*),
    count(*) filter (where exited_before),
    count(*) filter (where exited_after)
  into n, before_exits, after_exits
  from outcomes;

  if coalesce(n, 0) = 0 then
    return jsonb_build_object(
      'before', null, 'after', null, 'base_rate', base_rate, 'pp_delta', null,
      'n', 0, 'overlap_count', 0, 'suppressed', true
    );
  end if;

  return jsonb_build_object(
    'before', round(100.0 * before_exits / n, 1),
    'after', round(100.0 * after_exits / n, 1),
    'base_rate', base_rate,
    'pp_delta', round((100.0 * after_exits / n) - (100.0 * before_exits / n), 1),
    'n', n,
    'overlap_count', before_exits + after_exits,
    'suppressed', n < metrics.min_cell_size()
  );
end;
$$;

create or replace function metrics.c3_attrition_around_manager_change(filters jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
as $$
  select metrics._c3_org_event_measure(filters, array['%manager%change%', '%manager%']);
$$;

create or replace function metrics.c3_attrition_after_reorg(filters jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
as $$
  select metrics._c3_org_event_measure(filters, array['%reorg%']);
$$;

-- Reported as exit-rate before/after (like the other two org-event measures)
-- so callers can derive retention (100 - rate) with a consistent baseline.
create or replace function metrics.c3_retention_after_location_change(filters jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
as $$
  select metrics._c3_org_event_measure(filters, array['%location%', '%relocat%']);
$$;

-- ---------------------------------------------------------------------------
-- Exit interview coded drivers
-- ---------------------------------------------------------------------------

create or replace function metrics.c3_exit_driver_frequency(filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  result jsonb;
  total_interviews bigint;
begin
  with base as (
    select ei.primary_driver, ei.secondary_driver
    from public.exit_interviews ei
    join metrics.dim_termination_context ctx
      on ctx.employee_id = ei.employee_id and ctx.termination_date = ei.termination_date
    where metrics.termination_in_filters(ctx, filters)
  )
  select count(*) into total_interviews from base;

  with base as (
    select ei.primary_driver, ei.secondary_driver
    from public.exit_interviews ei
    join metrics.dim_termination_context ctx
      on ctx.employee_id = ei.employee_id and ctx.termination_date = ei.termination_date
    where metrics.termination_in_filters(ctx, filters)
  ),
  drivers as (
    select primary_driver as driver, 'primary' as role from base where primary_driver is not null
    union all
    select secondary_driver as driver, 'secondary' as role from base where secondary_driver is not null
  ),
  agg as (
    select
      driver,
      count(*) filter (where role = 'primary') as primary_count,
      count(*) filter (where role = 'secondary') as secondary_count,
      count(*) as total_count
    from drivers
    group by driver
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'driver', driver,
      'primary_count', primary_count,
      'secondary_count', secondary_count,
      'total_count', total_count,
      'pct_of_interviews', case when coalesce(total_interviews, 0) = 0 then null
                                 else round(100.0 * total_count / total_interviews, 1) end,
      'suppressed', total_count < metrics.min_cell_size()
    ) order by total_count desc), '[]'::jsonb)
  into result
  from agg;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Exit interview themes: reviewer-curated theme catalog (LLM/keyword-generated
-- label until reviewed=true promotes theme_label as the human-approved name).
-- ---------------------------------------------------------------------------

create table if not exists public.exit_interview_themes (
  theme_id text primary key,
  theme_label text,
  generated_label text,
  reviewed boolean default false,
  comment_count int,
  wave_period text,
  source_note text
);

grant select on public.exit_interview_themes to anon, authenticated, service_role;
grant insert, update, delete on public.exit_interview_themes to service_role;

-- filters is accepted for API-shape consistency with the other c3_* measures;
-- exit_interview_themes is an aggregate theme catalog with no per-employee
-- cut columns to filter on, so it is currently ignored (documented, not a bug).
create or replace function metrics.c3_exit_themes(filters jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'theme_id', t.theme_id,
      'label', coalesce(nullif(t.theme_label, ''), t.generated_label),
      'reviewed', coalesce(t.reviewed, false),
      'comment_count', coalesce(t.comment_count, 0),
      'wave_period', t.wave_period,
      'source_note', t.source_note,
      'suppressed', coalesce(t.comment_count, 0) < metrics.min_cell_size()
    ) order by coalesce(t.comment_count, 0) desc), '[]'::jsonb)
  from public.exit_interview_themes t;
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
