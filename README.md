# Meridian People Analytics Platform

Multi-page people analytics product (PRD through Class 5 / v0.5). Developer 1 owns the data path: Supabase schema, ingestion, metrics semantic layer, API routes, Wizard, and adversarial feedback loop.

## Stack

- Next.js App Router + TypeScript
- Supabase Postgres (`/supabase/migrations`)
- OpenAI API for the Wizard (server-side only)
- Anthropic API for the adversarial auditor (separate model — two-LLM setup)

## Local setup

1. Copy env defaults:

```bash
cp .env.example .env.local
```

2. Fill in Supabase values from your project (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Set:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Wizard LLM answers |
| `ADVERSARIAL_AI_LLM_API_KEY` | Adversarial auditor (Anthropic) — required to run live/full suites |
| `SESSION_SECRET` | Cookie signing (≥16 chars; required in production) |
| `ADVERSARIAL_CRON_SECRET` | Optional shared secret for cron-triggered audit runs |

3. Apply migrations to your Supabase project (SQL editor, or Supabase CLI):

```bash
# with Supabase CLI linked to the project
supabase db push
```

Or run the files in `supabase/migrations/` in lexical order.

4. Install and run:

```bash
npm install
npm run dev
```

5. Open [http://localhost:3000/admin/upload](http://localhost:3000/admin/upload) and load the Meridian source workbooks when ready. Mapping tables (`level_map`, `pay_zone_map`, `fx_rates`) are seeded by migration.

## Class 5 architecture (brief)

**Two-LLM adversarial loop.** The Wizard (OpenAI) answers people-analytics questions under the permission layer. A separate adversarial model (Anthropic, via `ADVERSARIAL_AI_LLM_API_KEY`) probes it across attack classes A1–A13. Failures become structured findings → human-governed improvement proposals → versioned Wizard artifacts only. The loop **never** edits `getVisibleEmployeeIds`, `canAccessField`, `applySuppression`, or related permission code (enforced by `lib/adversarial/writeGuard.ts`).

**Suites.** Probes live in `lib/adversarial/suites.ts`:

| Suite | Role |
|---|---|
| `live` | Development + regression cases (36–48 target) for day-to-day runs |
| `full` | All cases including holdout |
| `development` / `regression` / `holdout` | Isolated banks; holdout never feeds proposals |

**How to run the live suite**

1. Sign in as an **admin**.
2. Open **Admin → Adversarial AI** (`/admin/adversarial`), or `POST /api/adversarial/run` with `{ "suite": "live" }`.
3. Ensure both `OPENAI_API_KEY` and `ADVERSARIAL_AI_LLM_API_KEY` are set.
4. Review scores on **AI Quality** (`/admin/quality`) — Class 4 historical baseline is labelled separately from Class 5 suite scores.

Optional smoke: `npx tsx scripts/class5-smoke.ts` (suite shape checks without spending tokens).

### 30-day plan (summary)

| Days | Focus |
|---|---|
| 1–7 | Load one real dataset (employee master first) |
| 8–14 | Assign real `app_role`s; verify manager hierarchy; run access tests |
| **15–21** | **Replace email-only auth with enterprise identity; migrate permissions to Postgres RLS — gate before any second user** |
| 22–30 | Add next datasets; re-run adversarial loop on real data; then invite the first real user |

**Ordering rule:** authentication and RLS come before the second user, not after.

## Developer contract

`lib/types.ts` is the shared contract with Developer 2 (`FilterContext`, page payloads, `WizardChartSpec` / `WizardResponse`, ingest types, `MetricResultStatus`). Changing it obligates both developers to re-read it.

## API surface (Dev 1)

| Route | Method | Purpose |
|---|---|---|
| `/api/filters/meta` | GET | Dimension members, hierarchies, freshness |
| `/api/metrics/executive` | POST | Executive overview bundle |
| `/api/metrics/workforce` | POST | Workforce bundle |
| `/api/metrics/attrition` | POST | Attrition bundle |
| `/api/metrics/compensation` | POST | Compensation bundle |
| `/api/metrics/recruiting` | POST | Recruiting bundle |
| `/api/metrics/engagement` | POST | Engagement bundle |
| `/api/metrics/planning` | POST | Corrected FY base-salary estimate + recruiting capacity |
| `/api/signals` | GET | Proactive people signals (admin/executive) |
| `/api/methodology` | GET | Section 5 definitions |
| `/api/wizard` | POST | Wizard Q&A + chart spec |
| `/api/adversarial/run` | POST | Start adversarial suite (`suite: live \| full \| …`) |
| `/api/admin/quality` | GET | Quality dashboard summary |
| `/api/ingest/preview` | POST | multipart file preview |
| `/api/ingest/confirm` | POST | validate or promote (`confirm=true`) |

All metric POSTs accept `{ "filters": FilterContext }`. Aggregation happens in Postgres — route handlers do not recompute Section 5 definitions in application code beyond shaping API responses.

## Admin upload

`/admin/upload` — session + admin role required. Flow: detect dataset → header row → column map → validate → confirm promote → refresh materialized views → write `data_loads`.

## Drill-through placeholders

- `/drill`
- `/drill/manager/[id]`
- `/drill/function/[id]`
- `/drill/employee/[id]`
- `/drill/requisition/[id]`

## Locked product decisions (v0.5)

- Minimum cell size: **5**
- Auth: email-only sessions (password auth dropped — synthetic emails)
- Adversarial loop: human approval mandatory; permission layer immutable to the loop
- Source files: uploaded manually via admin when DB is ready

## Ownership reminder

| Path | Owner |
|---|---|
| `/supabase/**`, `/scripts/**`, `/lib/db/**`, `/lib/wizard/**`, `/lib/ingest/**`, `/lib/adversarial/**`, `/lib/signals/**`, `/app/api/**`, `/lib/types.ts`, `/admin/**` | Developer 1 |
| `/app/(dashboard)/**`, `/components/**`, `/lib/mock/**`, chart library | Developer 2 |
