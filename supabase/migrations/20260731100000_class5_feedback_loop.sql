-- Class 5: feedback loop, wizard versioning, proposals, suite metadata, MetricResultStatus support.

alter table public.adversarial_runs
  add column if not exists suite text,
  add column if not exists suite_version text,
  add column if not exists evaluator_version text,
  add column if not exists wizard_version text,
  add column if not exists answer_quality_score numeric,
  add column if not exists action_completion_score numeric,
  add column if not exists baseline_label text,
  add column if not exists token_usage jsonb,
  add column if not exists estimated_cost_usd numeric,
  add column if not exists average_latency_ms numeric;

alter table public.adversarial_probes
  add column if not exists suite text,
  add column if not exists attack_class text,
  add column if not exists role_under_test text,
  add column if not exists regression_category text,
  add column if not exists answer_quality_score numeric,
  add column if not exists action_completion_score numeric,
  add column if not exists action_requested boolean,
  add column if not exists action_completed boolean,
  add column if not exists deterministic_checks jsonb;

-- Structured findings derived from probe failures (feed the proposal step).
create table if not exists public.adversarial_findings_v2 (
  finding_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.adversarial_runs (run_id) on delete cascade,
  probe_result_id uuid references public.adversarial_probes (probe_result_id) on delete set null,
  failed_case_ids jsonb not null default '[]'::jsonb,
  attack_class text,
  severity text not null default 'medium',
  root_cause_classification text,
  summary text not null,
  supporting_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists adversarial_findings_v2_run_id_idx
  on public.adversarial_findings_v2 (run_id);

-- Improvement proposals — human-governed lifecycle.
create table if not exists public.improvement_proposals (
  proposal_id uuid primary key default gen_random_uuid(),
  finding_id uuid references public.adversarial_findings_v2 (finding_id) on delete set null,
  failed_case_ids jsonb not null default '[]'::jsonb,
  root_cause_classification text,
  proposed_change text not null,
  target_layer text not null,
  supporting_evidence jsonb not null default '{}'::jsonb,
  expected_effect text,
  possible_risks text,
  human_decision text,
  version_before text,
  version_after text,
  regression_result jsonb,
  holdout_result jsonb,
  final_disposition text,
  rollback_status text,
  lifecycle_state text not null default 'draft',
  created_by text,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists improvement_proposals_state_idx
  on public.improvement_proposals (lifecycle_state);

create table if not exists public.proposal_transitions (
  transition_id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.improvement_proposals (proposal_id) on delete cascade,
  from_state text,
  to_state text not null,
  actor text,
  note text,
  created_at timestamptz not null default now()
);

-- Versioned Wizard artifact bundles (permitted layers only).
create table if not exists public.wizard_versions (
  wizard_version text primary key,
  parent_version text,
  status text not null default 'active',
  system_prompt text,
  tool_descriptions jsonb not null default '{}'::jsonb,
  parameter_schemas jsonb not null default '{}'::jsonb,
  refusal_rules jsonb not null default '[]'::jsonb,
  clarification_rules jsonb not null default '[]'::jsonb,
  citation_template text,
  tool_availability jsonb not null default '{}'::jsonb,
  report_action_instructions text,
  created_by text,
  created_at timestamptz not null default now(),
  notes text
);

create table if not exists public.accepted_residual_risks (
  risk_id text primary key,
  attack_class text not null,
  title text not null,
  description text not null,
  controls_implemented jsonb not null default '[]'::jsonb,
  controls_detection_only jsonb not null default '[]'::jsonb,
  owner text not null,
  approved_by text,
  approved_at timestamptz,
  future_mitigation text,
  created_at timestamptz not null default now()
);

insert into public.accepted_residual_risks (
  risk_id, attack_class, title, description,
  controls_implemented, controls_detection_only, owner, future_mitigation
) values (
  'A3-differencing',
  'A3',
  'Aggregate differencing residual risk',
  'Suppression works as designed while an adversary may still subtract two legal aggregates to reconstruct an individual.',
  '["block_explicit_all_except_one", "minimum_delta_between_cohorts"]'::jsonb,
  '["neighboring_query_detection", "rate_limit_narrow_cuts", "audit_alerts_reconstruction"]'::jsonb,
  'platform-admin',
  'Query-history-aware suppression and session-level disclosure budgets (continued).'
) on conflict (risk_id) do nothing;

-- Prompt-injection fixtures (test-only namespace).
create table if not exists public.injection_test_fixtures (
  fixture_id uuid primary key default gen_random_uuid(),
  data_load_id text not null default 'DL-TEST-INJECTION',
  source_table text not null,
  source_pk text not null,
  hostile_text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Report lifecycle enrichment.
alter table public.customized_reports
  add column if not exists lifecycle_state text,
  add column if not exists failure_reason text,
  add column if not exists wizard_version text,
  add column if not exists report_spec_version text,
  add column if not exists reporting_boundary text,
  add column if not exists methodology_version text;

grant select on public.adversarial_findings_v2 to anon, authenticated, service_role;
grant select on public.improvement_proposals to anon, authenticated, service_role;
grant select on public.proposal_transitions to anon, authenticated, service_role;
grant select on public.wizard_versions to anon, authenticated, service_role;
grant select on public.accepted_residual_risks to anon, authenticated, service_role;
grant select on public.injection_test_fixtures to anon, authenticated, service_role;

grant insert, update, delete on public.adversarial_findings_v2 to service_role;
grant insert, update, delete on public.improvement_proposals to service_role;
grant insert, update, delete on public.proposal_transitions to service_role;
grant insert, update, delete on public.wizard_versions to service_role;
grant insert, update, delete on public.accepted_residual_risks to service_role;
grant insert, update, delete on public.injection_test_fixtures to service_role;
