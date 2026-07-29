-- Class 3 attrition risk methodology (risk-v0.2).
--
-- This is a transparent, additive point-scoring rubric over six observable
-- factors (F1-F6) with published rounded weights. It is NOT a fitted/trained
-- ML model: weights are analyst-set (a calibrated variant is published
-- side-by-side for comparison only), scoring is deterministic PL/pgSQL, and
-- every score exposes its inputs so a reviewer can see why a number moved.
-- Language throughout is associative ("higher points when X is observed"),
-- never causal.

create schema if not exists metrics;

-- ---------------------------------------------------------------------------
-- Versioning + published/calibrated weights + bands
-- ---------------------------------------------------------------------------

create or replace function metrics.risk_methodology_version()
returns text
language sql
immutable
as $$ select 'risk-v0.2' $$;

create or replace function metrics.risk_factor_weight_version()
returns text
language sql
immutable
as $$ select 'weights-v0.2-rounded' $$;

create or replace function metrics.risk_band_threshold_version()
returns text
language sql
immutable
as $$ select 'bands-v0.2' $$;

-- Published (rounded, applied) weights vs. a calibrated variant shown for
-- transparency. The calibrated column is illustrative for this teaching
-- dataset (not fit against real-world outcomes) and is never applied to
-- scores — only the published/rounded weights below are used in scoring.
create table if not exists metrics.risk_weight_publication (
  factor text primary key,
  factor_label text not null,
  published_weight numeric not null,
  calibrated_weight numeric not null,
  rationale text
);

insert into metrics.risk_weight_publication (factor, factor_label, published_weight, calibrated_weight, rationale) values
  ('F1', 'Engagement trajectory', 25, 24.6, 'Rounded for publication stability; illustrative calibration variant shown for comparison only.'),
  ('F2', 'Compa position & staleness', 20, 19.3, 'Rounded for publication stability; illustrative calibration variant shown for comparison only.'),
  ('F3', 'Mobility / stagnation signal', 20, 20.8, 'Rounded for publication stability; illustrative calibration variant shown for comparison only.'),
  ('F4', 'Manager context', 15, 14.7, 'Rounded for publication stability; illustrative calibration variant shown for comparison only.'),
  ('F5', 'Tenure hazard curve', 10, 10.9, 'Rounded for publication stability; illustrative calibration variant shown for comparison only.'),
  ('F6', 'Recent org events', 10, 9.7, 'Rounded for publication stability; illustrative calibration variant shown for comparison only.')
on conflict (factor) do update
  set factor_label = excluded.factor_label,
      published_weight = excluded.published_weight,
      calibrated_weight = excluded.calibrated_weight,
      rationale = excluded.rationale;

create table if not exists metrics.risk_band_thresholds (
  band text primary key,
  min_score numeric not null,
  max_score numeric not null,
  band_rank int not null
);

insert into metrics.risk_band_thresholds (band, min_score, max_score, band_rank) values
  ('Low', 0, 24, 1),
  ('Moderate', 25, 49, 2),
  ('Elevated', 50, 74, 3),
  ('High', 75, 100, 4)
on conflict (band) do update
  set min_score = excluded.min_score,
      max_score = excluded.max_score,
      band_rank = excluded.band_rank;

create or replace function metrics.risk_band(score numeric)
returns text
language sql
immutable
as $$
  select case
    when score is null then null
    when score < 25 then 'Low'
    when score < 50 then 'Moderate'
    when score < 75 then 'Elevated'
    else 'High'
  end;
$$;

create or replace function metrics.risk_band_rank(band text)
returns int
language sql
immutable
as $$
  select case band
    when 'Low' then 1
    when 'Moderate' then 2
    when 'Elevated' then 3
    when 'High' then 4
    else 5
  end;
$$;

-- ---------------------------------------------------------------------------
-- metrics.attrition_risk_score: the per-employee scoring engine
-- ---------------------------------------------------------------------------

create or replace function metrics.attrition_risk_score(p_employee_id text, p_as_of date default null)
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := coalesce(p_as_of, metrics.reporting_as_of());
  snap record;
  data_load_id uuid;
  w_f1 numeric; w_f2 numeric; w_f3 numeric; w_f4 numeric; w_f5 numeric; w_f6 numeric;
  f1 jsonb; f2 jsonb; f3 jsonb; f4 jsonb; f5 jsonb; f6 jsonb;
  factors jsonb;
  factor_elem jsonb;
  sum_points numeric := 0;
  sum_available_max numeric := 0;
  available_count int := 0;
  missing_count int := 0;
  total_score numeric;
  band text;
  sufficiency text;
begin
  select published_weight into w_f1 from metrics.risk_weight_publication where factor = 'F1';
  select published_weight into w_f2 from metrics.risk_weight_publication where factor = 'F2';
  select published_weight into w_f3 from metrics.risk_weight_publication where factor = 'F3';
  select published_weight into w_f4 from metrics.risk_weight_publication where factor = 'F4';
  select published_weight into w_f5 from metrics.risk_weight_publication where factor = 'F5';
  select published_weight into w_f6 from metrics.risk_weight_publication where factor = 'F6';

  select s.* into snap
  from metrics.dim_snapshot s
  where s.employee_id = p_employee_id
    and s.as_of_date <= as_of
  order by s.as_of_date desc
  limit 1;

  select id into data_load_id from public.data_loads order by loaded_at desc limit 1;

  -- F1: Engagement trajectory (trailing 18 months, up to 4 observations)
  declare
    obs_scores numeric[];
    obs_dates date[];
    level numeric;
    trend numeric;
    base_pts numeric;
    trend_adj numeric;
    pts numeric;
    obs_count int;
  begin
    select array_agg(engagement_score order by observation_date desc),
           array_agg(observation_date order by observation_date desc)
    into obs_scores, obs_dates
    from (
      select engagement_score, observation_date
      from public.engagement_score_history
      where employee_id = p_employee_id
        and observation_date <= as_of
        and observation_date > (as_of - interval '18 months')::date
        and engagement_score is not null
      order by observation_date desc
      limit 4
    ) x;

    obs_count := coalesce(array_length(obs_scores, 1), 0);

    if obs_count = 0 then
      f1 := jsonb_build_object(
        'factor', 'F1', 'available', false, 'status', 'insufficient_data',
        'points', 0, 'maximum_points', w_f1, 'driving_value', null,
        'reason', null,
        'missing_reason', 'No engagement observations in the trailing 18 months.',
        'source_measure', 'engagement_score_history', 'as_of_date', null
      );
    else
      level := obs_scores[1];
      if obs_count >= 2 then
        trend := obs_scores[1] - obs_scores[obs_count];
      else
        trend := 0;
      end if;
      base_pts := case when level < 4 then 20 when level < 6 then 12 when level < 8 then 6 else 2 end;
      trend_adj := case when trend <= -1 then 5 when trend >= 1 then -3 else 0 end;
      pts := greatest(0, least(w_f1, base_pts + trend_adj));
      f1 := jsonb_build_object(
        'factor', 'F1', 'available', true,
        'status', case when obs_count >= 2 then 'available' else 'available_no_trend' end,
        'points', pts, 'maximum_points', w_f1,
        'driving_value', level,
        'reason', format(
          'Latest engagement score %s (0-10 scale); trend %s over %s observation(s) in the trailing 18 months.',
          round(level, 1), round(trend, 1), obs_count
        ),
        'missing_reason', null,
        'source_measure', 'engagement_score_history', 'as_of_date', obs_dates[1]
      );
    end if;
  end;

  -- F2: Compa position & comp staleness (upward compensation_events)
  declare
    compa numeric;
    last_upward_date date;
    staleness_months numeric;
    base_pts numeric;
    stale_add numeric;
    pts numeric;
  begin
    compa := snap.compa_ratio;

    select max(event_date) into last_upward_date
    from public.compensation_events
    where employee_id = p_employee_id
      and event_date <= as_of
      and (
        lower(coalesce(event_type, '')) like '%merit%'
        or lower(coalesce(event_type, '')) like '%promotion%'
        or lower(coalesce(event_type, '')) like '%increase%'
        or coalesce(merit_percent, 0) > 0
      );

    if compa is null then
      f2 := jsonb_build_object(
        'factor', 'F2', 'available', false, 'status', 'insufficient_data',
        'points', 0, 'maximum_points', w_f2, 'driving_value', null,
        'reason', null,
        'missing_reason', 'No compa-ratio on the latest snapshot.',
        'source_measure', 'employee_snapshots',
        'as_of_date', case when snap.employee_id is not null then snap.as_of_date else null end
      );
    else
      staleness_months := extract(epoch from (as_of - coalesce(last_upward_date, as_of - interval '100 years'))) / 2629800.0;
      base_pts := case when compa < 0.85 then 14 when compa < 0.95 then 9 when compa < 1.05 then 4 else 0 end;
      stale_add := case when staleness_months >= 24 then 6 when staleness_months >= 12 then 3 else 0 end;
      pts := least(w_f2, base_pts + stale_add);
      f2 := jsonb_build_object(
        'factor', 'F2', 'available', true, 'status', 'available',
        'points', pts, 'maximum_points', w_f2,
        'driving_value', compa,
        'reason', format(
          'Compa-ratio %s; %s months since last upward comp event.', round(compa, 2), round(staleness_months)
        ),
        'missing_reason', null,
        'source_measure', 'employee_snapshots, compensation_events', 'as_of_date', snap.as_of_date
      );
    end if;
  end;

  -- F3: Mobility / stagnation (months since promotion + recent perf signal)
  declare
    months_since_promo numeric;
    perf text;
    recent_promo_rec boolean;
    base_pts numeric;
    perf_boost numeric;
    pts numeric;
  begin
    months_since_promo := snap.months_since_promotion;
    perf := snap.perf_rating;

    select bool_or(lower(coalesce(promotion_recommendation, '')) ~ '(yes|recommend|approv)')
    into recent_promo_rec
    from public.performance_reviews
    where employee_id = p_employee_id
      and review_date <= as_of
      and review_date > (as_of - interval '18 months')::date;

    if months_since_promo is null and perf is null then
      f3 := jsonb_build_object(
        'factor', 'F3', 'available', false, 'status', 'insufficient_data',
        'points', 0, 'maximum_points', w_f3, 'driving_value', null,
        'reason', null,
        'missing_reason', 'No promotion history or performance rating on file.',
        'source_measure', 'employee_snapshots, performance_reviews',
        'as_of_date', case when snap.employee_id is not null then snap.as_of_date else null end
      );
    else
      base_pts := case
        when months_since_promo is null then 0
        when months_since_promo >= 36 then 10
        when months_since_promo >= 24 then 6
        when months_since_promo >= 12 then 3
        else 0
      end;
      perf_boost := case
        when perf in ('Exceeded', 'Significantly Exceeded') or coalesce(recent_promo_rec, false) then 5
        else 0
      end;
      pts := least(w_f3, base_pts + perf_boost);
      f3 := jsonb_build_object(
        'factor', 'F3', 'available', true, 'status', 'available',
        'points', pts, 'maximum_points', w_f3,
        'driving_value', months_since_promo,
        'reason', format(
          '%s months since last promotion; last rating %s.',
          coalesce(months_since_promo::text, 'unknown'), coalesce(perf, 'unknown')
        ),
        'missing_reason', null,
        'source_measure', 'employee_snapshots, performance_reviews', 'as_of_date', snap.as_of_date
      );
    end if;
  end;

  -- F4: Manager context (team voluntary TTM + engagement vs. company; n>=5)
  declare
    manager_id text;
    team_size bigint;
    team_voluntary_count numeric;
    team_voluntary_rate numeric;
    team_engagement numeric;
    company_voluntary_rate numeric;
    company_engagement numeric;
    pts numeric;
  begin
    manager_id := snap.manager_employee_id;

    if manager_id is null then
      team_size := 0;
    else
      select count(*) into team_size
      from metrics.dim_snapshot s2
      where s2.manager_employee_id = manager_id
        and s2.as_of_date = snap.as_of_date
        and s2.employment_status ilike 'active%';
    end if;

    if manager_id is null or coalesce(team_size, 0) < 5 then
      f4 := jsonb_build_object(
        'factor', 'F4', 'available', false, 'status', 'insufficient_data',
        'points', 0, 'maximum_points', w_f4, 'driving_value', coalesce(team_size, 0),
        'reason', null,
        'missing_reason', 'Manager team below the minimum reportable size (n>=5).',
        'source_measure', 'employee_snapshots, termination_history',
        'as_of_date', case when snap.employee_id is not null then snap.as_of_date else null end
      );
    else
      company_voluntary_rate := metrics.c3_voluntary_attrition_rate('{}'::jsonb);

      select avg(s2.engagement_score) into company_engagement
      from metrics.dim_snapshot s2
      where s2.as_of_date = snap.as_of_date and s2.employment_status ilike 'active%';

      select count(*)::numeric into team_voluntary_count
      from public.termination_history th
      where th.manager_employee_id = manager_id
        and lower(coalesce(th.termination_type, '')) = 'voluntary'
        and th.termination_date > (as_of - interval '12 months')::date
        and th.termination_date <= as_of;

      team_voluntary_rate := round(100.0 * coalesce(team_voluntary_count, 0) / team_size, 1);

      select avg(s2.engagement_score) into team_engagement
      from metrics.dim_snapshot s2
      where s2.manager_employee_id = manager_id
        and s2.as_of_date = snap.as_of_date
        and s2.employment_status ilike 'active%';

      pts := 0;
      if team_voluntary_rate > company_voluntary_rate + 5 then
        pts := pts + 5;
      elsif team_voluntary_rate > company_voluntary_rate then
        pts := pts + 2;
      end if;
      if team_engagement is not null and company_engagement is not null then
        if team_engagement < company_engagement - 1 then
          pts := pts + 5;
        elsif team_engagement < company_engagement then
          pts := pts + 2;
        end if;
      end if;
      pts := least(w_f4, pts);

      f4 := jsonb_build_object(
        'factor', 'F4', 'available', true, 'status', 'available',
        'points', pts, 'maximum_points', w_f4,
        'driving_value', team_voluntary_rate,
        'reason', format(
          'Team (n=%s) voluntary TTM %s%% vs. company %s%%; team engagement %s vs. company %s.',
          team_size, team_voluntary_rate, company_voluntary_rate,
          coalesce(round(team_engagement, 1)::text, 'n/a'), coalesce(round(company_engagement, 1)::text, 'n/a')
        ),
        'missing_reason', null,
        'source_measure', 'employee_snapshots, termination_history', 'as_of_date', snap.as_of_date
      );
    end if;
  end;

  -- F5: Tenure hazard curve (company-wide empirical band rate scaled to points)
  declare
    emp_hazard_band text;
    emp_hazard_rate numeric;
    emp_hazard_suppressed boolean;
    hazard_curve jsonb;
    pts numeric;
  begin
    if snap.tenure_months is null then
      f5 := jsonb_build_object(
        'factor', 'F5', 'available', false, 'status', 'insufficient_data',
        'points', 0, 'maximum_points', w_f5, 'driving_value', null,
        'reason', null,
        'missing_reason', 'No tenure_months on the latest snapshot.',
        'source_measure', 'employee_snapshots, termination_history', 'as_of_date', null
      );
    else
      emp_hazard_band := metrics.hazard_band_from_months(snap.tenure_months);
      hazard_curve := metrics.c3_tenure_hazard('{}'::jsonb);

      select (elem->>'rate')::numeric, (elem->>'suppressed')::boolean
      into emp_hazard_rate, emp_hazard_suppressed
      from jsonb_array_elements(hazard_curve) elem
      where elem->>'band' = emp_hazard_band;

      if emp_hazard_rate is null or coalesce(emp_hazard_suppressed, true) then
        f5 := jsonb_build_object(
          'factor', 'F5', 'available', false, 'status', 'insufficient_data',
          'points', 0, 'maximum_points', w_f5, 'driving_value', snap.tenure_months,
          'reason', null,
          'missing_reason', format('Tenure band %s has too few company-wide observations to publish a rate.', emp_hazard_band),
          'source_measure', 'employee_snapshots, termination_history', 'as_of_date', snap.as_of_date
        );
      else
        pts := least(w_f5, round(emp_hazard_rate / 3.0, 1));
        f5 := jsonb_build_object(
          'factor', 'F5', 'available', true, 'status', 'available',
          'points', pts, 'maximum_points', w_f5,
          'driving_value', snap.tenure_months,
          'reason', format(
            'Tenure band %s has a company-wide trailing-12-month voluntary exit rate of %s%%.',
            emp_hazard_band, emp_hazard_rate
          ),
          'missing_reason', null,
          'source_measure', 'employee_snapshots, termination_history', 'as_of_date', snap.as_of_date
        );
      end if;
    end if;
  end;

  -- F6: Recent org events (trailing 6 months), additive, capped at the factor max
  declare
    events_6m int;
    pts numeric;
  begin
    events_6m := coalesce(snap.org_events_last_6m, 0);
    pts := least(w_f6, events_6m * 3);
    f6 := jsonb_build_object(
      'factor', 'F6', 'available', true, 'status', 'available',
      'points', pts, 'maximum_points', w_f6,
      'driving_value', events_6m,
      'reason', format('%s org event(s) in the trailing 6 months.', events_6m),
      'missing_reason', null,
      'source_measure', 'employee_snapshots.org_events_last_6m',
      'as_of_date', case when snap.employee_id is not null then snap.as_of_date else null end
    );
  end;

  factors := jsonb_build_array(f1, f2, f3, f4, f5, f6);

  for factor_elem in select * from jsonb_array_elements(factors) loop
    if (factor_elem->>'available')::boolean then
      sum_points := sum_points + (factor_elem->>'points')::numeric;
      sum_available_max := sum_available_max + (factor_elem->>'maximum_points')::numeric;
      available_count := available_count + 1;
    else
      missing_count := missing_count + 1;
    end if;
  end loop;

  if snap.employee_id is null or sum_available_max < 60 then
    sufficiency := 'insufficient';
    total_score := null;
    band := null;
  else
    sufficiency := 'sufficient';
    total_score := round(100.0 * sum_points / sum_available_max, 0);
    band := metrics.risk_band(total_score);
  end if;

  return jsonb_build_object(
    'employee_id', p_employee_id,
    'total_score', total_score,
    'risk_band', band,
    'data_sufficiency', sufficiency,
    'available_factor_count', available_count,
    'missing_factor_count', missing_count,
    'methodology_version', metrics.risk_methodology_version(),
    'factor_weight_version', metrics.risk_factor_weight_version(),
    'band_threshold_version', metrics.risk_band_threshold_version(),
    'calculated_at', now(),
    'reporting_boundary', as_of,
    'data_load_id', data_load_id,
    'factors', factors
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Cohort-level risk reporting
-- ---------------------------------------------------------------------------

-- Cohort counts by band only — never returns employee names/ids.
create or replace function metrics.c3_risk_band_distribution(filters jsonb default '{}'::jsonb)
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
    select s.employee_id
    from metrics.dim_snapshot s
    where s.as_of_date = snap_asof
      and s.employment_status ilike 'active%'
      and metrics.snapshot_in_filters(s, filters)
  ),
  scored as (
    select (metrics.attrition_risk_score(p.employee_id, as_of)->>'risk_band') as band
    from pop p
  )
  select jsonb_build_object(
    'Low', count(*) filter (where band = 'Low'),
    'Moderate', count(*) filter (where band = 'Moderate'),
    'Elevated', count(*) filter (where band = 'Elevated'),
    'High', count(*) filter (where band = 'High'),
    'Insufficient', count(*) filter (where band is null),
    'total', count(*)
  )
  into result
  from scored;

  return result;
end;
$$;

-- Mean points contributed by each factor, restricted to Elevated+/High employees.
create or replace function metrics.c3_risk_factor_contribution(filters jsonb default '{}'::jsonb)
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
    select s.employee_id
    from metrics.dim_snapshot s
    where s.as_of_date = snap_asof
      and s.employment_status ilike 'active%'
      and metrics.snapshot_in_filters(s, filters)
  ),
  scored as (
    select metrics.attrition_risk_score(p.employee_id, as_of) as score
    from pop p
  ),
  elevated as (
    select score from scored where score->>'risk_band' in ('Elevated', 'High')
  ),
  factor_points as (
    select
      (f->>'factor') as factor,
      (f->>'points')::numeric as points,
      (f->>'available')::boolean as available
    from elevated e, jsonb_array_elements(e.score->'factors') f
  ),
  agg as (
    select
      factor,
      round(avg(points) filter (where available), 1) as mean_points,
      count(*) filter (where available) as n
    from factor_points
    group by factor
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'factor', factor, 'mean_points', mean_points, 'n', n,
      'suppressed', n < metrics.min_cell_size()
    ) order by factor), '[]'::jsonb)
  into result
  from agg;

  return result;
end;
$$;

-- Backtest: score the active population as of reporting_as_of() - 12 months,
-- then check whether they had a voluntary exit in the following 12 months.
-- Uses today's company-wide benchmark curves (tenure hazard, company voluntary
-- rate) rather than fully point-in-time ones — a known simplification given
-- limited historical snapshot depth in this teaching dataset. Always returns a
-- structure, even when the observed lift is weak or n is thin.
create or replace function metrics.c3_risk_backtest()
returns jsonb
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  as_of_hist date := (as_of - interval '12 months')::date;
  outcome_end date := (as_of_hist + interval '12 months')::date;
  snap_hist date;
  result jsonb;
begin
  select max(as_of_date) into snap_hist from public.employee_snapshots where as_of_date <= as_of_hist;

  if snap_hist is null then
    return jsonb_build_object(
      'as_of_scoring_date', as_of_hist,
      'outcome_window_end', outcome_end,
      'overall_voluntary_exit_rate', null,
      'bands', '[]'::jsonb,
      'note', 'No snapshot available at the scoring boundary; backtest cannot be computed yet.'
    );
  end if;

  with scored_outcomes as materialized (
    select
      sc.employee_id,
      sc.band,
      exists (
        select 1 from public.termination_history th
        where th.employee_id = sc.employee_id
          and lower(coalesce(th.termination_type, '')) = 'voluntary'
          and th.termination_date > as_of_hist
          and th.termination_date <= outcome_end
      ) as exited
    from (
      select
        p.employee_id,
        (metrics.attrition_risk_score(p.employee_id, as_of_hist)->>'risk_band') as band
      from (
        select s.employee_id
        from metrics.dim_snapshot s
        where s.as_of_date = snap_hist and s.employment_status ilike 'active%'
      ) p
    ) sc
  ),
  overall as (
    select round(100.0 * count(*) filter (where exited) / nullif(count(*), 0), 1) as rate
    from scored_outcomes
  ),
  by_band as (
    select coalesce(band, 'Insufficient') as band, count(*) as n, count(*) filter (where exited) as exits
    from scored_outcomes
    group by coalesce(band, 'Insufficient')
  )
  select jsonb_build_object(
    'as_of_scoring_date', as_of_hist,
    'outcome_window_end', outcome_end,
    'overall_voluntary_exit_rate', (select rate from overall),
    'bands', coalesce((
      select jsonb_agg(jsonb_build_object(
          'band', b.band,
          'n', b.n,
          'exit_rate', round(100.0 * b.exits / nullif(b.n, 0), 1),
          'lift_vs_overall', case
            when (select rate from overall) is null or (select rate from overall) = 0 then null
            else round((100.0 * b.exits / nullif(b.n, 0)) / (select rate from overall), 2)
          end,
          'suppressed', b.n < metrics.min_cell_size()
        ) order by metrics.risk_band_rank(b.band))
      from by_band b
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

-- Active headcount with Elevated or High risk band at the reporting boundary.
create or replace function metrics.c3_elevated_risk_headcount(filters jsonb default '{}'::jsonb)
returns bigint
language plpgsql
stable
as $$
declare
  as_of date := metrics.reporting_as_of();
  snap_asof date;
  n bigint;
begin
  select max(as_of_date) into snap_asof from public.employee_snapshots where as_of_date <= as_of;

  select count(*) into n
  from (
    select s.employee_id
    from metrics.dim_snapshot s
    where s.as_of_date = snap_asof
      and s.employment_status ilike 'active%'
      and metrics.snapshot_in_filters(s, filters)
  ) p
  where (metrics.attrition_risk_score(p.employee_id, as_of)->>'risk_band') in ('Elevated', 'High');

  return coalesce(n, 0);
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
