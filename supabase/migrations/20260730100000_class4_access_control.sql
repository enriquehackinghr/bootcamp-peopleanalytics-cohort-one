-- Class 4: access control columns, timeline tables, audit log, planning stubs

-- ---------------------------------------------------------------------------
-- Employee directory extensions (DG1, DG2, DG8)
-- ---------------------------------------------------------------------------

alter table public.employees
  add column if not exists app_role text
    check (app_role is null or app_role in ('admin', 'executive', 'manager', 'viewer'));

alter table public.employees
  add column if not exists is_active boolean;

alter table public.employees
  add column if not exists data_load_id text;

update public.employees
set is_active = (employment_status in ('Active', 'active', 'On Leave', 'on leave'))
where is_active is null;

-- Seed demo roles by email local-part when app_role is still null (live class).
update public.employees set app_role = 'admin'
where app_role is null and lower(split_part(coalesce(work_email, ''), '@', 1)) = 'amy.gray';

update public.employees set app_role = 'executive'
where app_role is null and lower(split_part(coalesce(work_email, ''), '@', 1)) = 'sarah.lin';

update public.employees set app_role = 'manager'
where app_role is null and lower(split_part(coalesce(work_email, ''), '@', 1)) in ('janet.williams', 'ryan.parsons');

update public.employees set app_role = 'viewer'
where app_role is null and lower(split_part(coalesce(work_email, ''), '@', 1)) = 'elaine.williams';

-- Remaining actives default to viewer so email login works after Class 4.
update public.employees
set app_role = 'viewer'
where app_role is null and coalesce(is_active, false) = true;

-- Unique work_email among non-null values (defensive; DG2 remediated in v4 package).
-- Skip rather than fail the whole Class 4 migration if duplicates remain in the live load.
do $$
begin
  if exists (
    select 1
    from public.employees
    where work_email is not null
    group by lower(work_email)
    having count(*) > 1
  ) then
    raise notice 'Skipping employees_work_email_unique_idx — duplicate work_email values present';
  else
    create unique index if not exists employees_work_email_unique_idx
      on public.employees (lower(work_email))
      where work_email is not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- data_loads reporting boundary columns
-- ---------------------------------------------------------------------------

alter table public.data_loads
  add column if not exists data_load_id text;

alter table public.data_loads
  add column if not exists reporting_boundary date;

alter table public.data_loads
  add column if not exists validation_status text;

-- ---------------------------------------------------------------------------
-- Employee timeline (event header + changes)
-- ---------------------------------------------------------------------------

create table if not exists public.employee_timeline_events (
  event_id text primary key,
  employee_id text not null references public.employees (employee_id),
  effective_date date not null,
  event_type text not null,
  reason_code text,
  notes text,
  source_system text,
  created_at timestamptz not null default now(),
  data_load_id text,
  backfilled boolean not null default false
);

create index if not exists employee_timeline_events_emp_date_idx
  on public.employee_timeline_events (employee_id, effective_date desc);

create table if not exists public.employee_timeline_changes (
  change_id text primary key,
  event_id text not null references public.employee_timeline_events (event_id) on delete cascade,
  field_changed text not null,
  value_from_text text,
  value_to_text text,
  value_from_numeric numeric,
  value_to_numeric numeric,
  value_from_date date,
  value_to_date date,
  currency_code text,
  reference_employee_id text,
  reference_entity_type text
);

create index if not exists employee_timeline_changes_event_idx
  on public.employee_timeline_changes (event_id);

-- ---------------------------------------------------------------------------
-- Access audit log
-- ---------------------------------------------------------------------------

create table if not exists public.access_audit_log (
  event_id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null default now(),
  session_id text,
  employee_id text,
  work_email text,
  app_role text,
  action text not null,
  target_type text,
  target_id text,
  route text,
  tool_name text,
  scope_size integer,
  outcome text not null default 'success',
  denial_reason text,
  metadata jsonb,
  data_load_id text
);

create index if not exists access_audit_log_ts_idx
  on public.access_audit_log (timestamp desc);

create index if not exists access_audit_log_employee_idx
  on public.access_audit_log (employee_id, timestamp desc);

-- ---------------------------------------------------------------------------
-- FY26 compensation budget (DG7)
-- ---------------------------------------------------------------------------

create table if not exists public.fy26_comp_budget (
  function_name text not null,
  fiscal_quarter text not null,
  approved_base_salary_budget numeric(14, 2) not null,
  approved_merit_pool_pct numeric(8, 4),
  approved_promotion_pool_pct numeric(8, 4),
  currency_code text not null default 'USD',
  data_load_id text,
  primary key (function_name, fiscal_quarter)
);

-- ---------------------------------------------------------------------------
-- Scenario runs (assumptions only — never write source tables)
-- ---------------------------------------------------------------------------

create table if not exists public.scenario_runs (
  scenario_id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by_employee_id text,
  scenario_type text not null check (scenario_type in ('baseline', 'growth', 'contraction', 'restructuring')),
  assumption_set jsonb not null default '{}'::jsonb,
  data_load_id text,
  reporting_boundary date,
  calculation_method_version text not null default 'planning-v1'
);

-- ---------------------------------------------------------------------------
-- Leave history (DG4)
-- ---------------------------------------------------------------------------

create table if not exists public.leave_history (
  leave_id text primary key,
  employee_id text not null references public.employees (employee_id),
  leave_type text,
  start_date date not null,
  end_date date,
  status text,
  currently_open boolean not null default false,
  data_load_id text
);

grant select, insert on public.access_audit_log to service_role;
grant select, insert, update, delete on public.employee_timeline_events to service_role;
grant select, insert, update, delete on public.employee_timeline_changes to service_role;
grant select, insert, update, delete on public.fy26_comp_budget to service_role;
grant select, insert, update, delete on public.scenario_runs to service_role;
grant select, insert, update, delete on public.leave_history to service_role;
