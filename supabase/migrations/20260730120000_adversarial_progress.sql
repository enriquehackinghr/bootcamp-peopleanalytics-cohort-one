-- Live progress support for adversarial runs.
alter table public.adversarial_runs
  add column if not exists total_probes int;

comment on column public.adversarial_runs.total_probes is
  'Total number of probes queued at run-start. reports_audited advances toward this as probes complete.';
