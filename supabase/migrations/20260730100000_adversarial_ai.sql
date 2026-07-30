-- Adversarial AI (Red-Team Auditor):
-- Claude reviews customized reports produced by the OpenAI-backed wizard and
-- scores them across five dimensions (factual_grounding, methodology_soundness,
-- bias_fairness, hallucination, actionability). Runs are persisted as a header
-- row + per-report findings.

create table if not exists public.adversarial_runs (
  run_id uuid primary key default gen_random_uuid(),
  triggered_by text not null default 'manual',            -- 'manual' | 'cron' | text label
  triggered_by_user text,
  status text not null default 'pending',                  -- 'pending' | 'running' | 'completed' | 'failed'
  model text,
  reports_audited int not null default 0,
  composite_score numeric,                                 -- 0..100 weighted
  letter_grade text,                                       -- 'A'..'F'
  summary text,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists adversarial_runs_started_at_idx
  on public.adversarial_runs (started_at desc);

create table if not exists public.adversarial_findings (
  finding_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.adversarial_runs (run_id) on delete cascade,
  report_id uuid,                                          -- customized_reports.report_id (no FK — reports may be deleted)
  report_title text,
  factual_grounding numeric,                               -- 1..5
  methodology_soundness numeric,                           -- 1..5
  bias_fairness numeric,                                   -- 1..5
  hallucination numeric,                                   -- 1..5 (higher = less hallucination)
  actionability numeric,                                   -- 1..5
  report_composite numeric,                                -- 0..100 weighted
  report_grade text,                                       -- 'A'..'F'
  severity text not null default 'info',                   -- 'critical' | 'warning' | 'info'
  summary text,
  recommendations jsonb not null default '[]'::jsonb,      -- string[]
  flags jsonb not null default '[]'::jsonb,                -- [{severity, dimension, description}]
  raw_response jsonb,                                      -- auditor's raw tool-call payload for debugging
  created_at timestamptz not null default now()
);

create index if not exists adversarial_findings_run_id_idx
  on public.adversarial_findings (run_id);
create index if not exists adversarial_findings_report_id_idx
  on public.adversarial_findings (report_id);
create index if not exists adversarial_findings_severity_idx
  on public.adversarial_findings (severity);

-- Bootcamp environment: open read for anon/authenticated; service_role owns writes.
grant select on public.adversarial_runs to anon, authenticated, service_role;
grant select on public.adversarial_findings to anon, authenticated, service_role;
grant insert, update, delete on public.adversarial_runs to service_role;
grant insert, update, delete on public.adversarial_findings to service_role;
