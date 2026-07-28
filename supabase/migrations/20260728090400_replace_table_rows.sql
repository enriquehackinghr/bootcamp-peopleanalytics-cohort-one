-- Replace-promote helper for idempotent re-loads (ING-13)

create or replace function public.replace_table_rows(
  target_table text,
  rows jsonb
)
returns integer
language plpgsql
security definer
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
    'competency_framework'
  ) then
    raise exception 'Refusing to replace unknown table %', target_table;
  end if;

  execute format('delete from public.%I', target_table);

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
