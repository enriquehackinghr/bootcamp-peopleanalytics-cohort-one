-- Redesign the adversarial auditor:
-- Instead of scoring already-persisted customized reports, the auditor sends
-- curated adversarial probes to the wizard (POST /api/wizard) and evaluates the
-- wizard's live responses. Each probe result becomes one row here.

drop table if exists public.adversarial_findings;

create table if not exists public.adversarial_probes (
  probe_result_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.adversarial_runs (run_id) on delete cascade,
  probe_key text not null,                               -- stable id from the probe bank
  probe_category text not null,                          -- primary dimension being probed
  probe_question text not null,
  expected_behavior text not null,                       -- what a correct wizard response should do
  wizard_answer text,
  wizard_refused boolean,
  wizard_refusal_reason text,
  wizard_latency_ms int,
  wizard_error text,
  wizard_raw jsonb,                                       -- full WizardResponse for debugging
  factual_grounding numeric,                             -- 1..5
  methodology_soundness numeric,                         -- 1..5
  bias_fairness numeric,                                 -- 1..5
  hallucination numeric,                                 -- 1..5 (higher = less hallucination)
  actionability numeric,                                 -- 1..5
  probe_composite numeric,                                -- 0..100 weighted
  probe_grade text,                                       -- 'A'..'F'
  severity text not null default 'info',                  -- 'critical' | 'warning' | 'info'
  summary text,
  recommendations jsonb not null default '[]'::jsonb,
  flags jsonb not null default '[]'::jsonb,
  raw_response jsonb,
  created_at timestamptz not null default now()
);

create index if not exists adversarial_probes_run_id_idx
  on public.adversarial_probes (run_id);
create index if not exists adversarial_probes_category_idx
  on public.adversarial_probes (probe_category);
create index if not exists adversarial_probes_severity_idx
  on public.adversarial_probes (severity);

-- Rename the "reports_audited" column semantics: it now counts probes executed.
-- Keep the column name for compatibility with the run row.
comment on column public.adversarial_runs.reports_audited is
  'Count of adversarial probes executed against the wizard in this run.';

grant select on public.adversarial_probes to anon, authenticated, service_role;
grant insert, update, delete on public.adversarial_probes to service_role;
