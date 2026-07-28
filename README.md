# Meridian People Analytics Platform

Multi-page people analytics product (PRD v0.1). Developer 1 owns the data path: Supabase schema, ingestion, metrics semantic layer, API routes, and Wizard.

## Stack

- Next.js App Router + TypeScript
- Supabase Postgres (`/supabase/migrations`)
- OpenAI API for the Wizard (server-side only)

## Local setup

1. Copy env defaults:

```bash
cp .env.example .env.local
```

2. Fill in Supabase values from your project (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Optionally set `OPENAI_API_KEY` for Wizard LLM answers (measure snapshots still work without it).

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

## Developer contract

`lib/types.ts` is the shared contract with Developer 2 (`FilterContext`, page payloads, `WizardChartSpec` / `WizardResponse`, ingest types). Changing it obligates both developers to re-read it.

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
| `/api/methodology` | GET | Section 5 definitions |
| `/api/wizard` | POST | Wizard Q&A + chart spec |
| `/api/ingest/preview` | POST | multipart file preview |
| `/api/ingest/confirm` | POST | validate or promote (`confirm=true`) |

All metric POSTs accept `{ "filters": FilterContext }`. Aggregation happens in Postgres — route handlers do not recompute Section 5 definitions in application code beyond shaping API responses.

## Admin upload

`/admin/upload` — no auth in v0.1 (Day 4). Flow: detect dataset → header row → column map → validate → confirm promote → refresh materialized views → write `data_loads`.

## Drill-through placeholders

- `/drill`
- `/drill/manager/[id]`
- `/drill/function/[id]`
- `/drill/employee/[id]`
- `/drill/requisition/[id]`

## Locked product decisions (v0.1)

- Minimum cell size: **5**
- Drill-through placeholders: **yes**
- Admin upload auth: **no** (until Day 4)
- Source files: uploaded manually via admin when DB is ready

## Ownership reminder

| Path | Owner |
|---|---|
| `/supabase/**`, `/scripts/**`, `/lib/db/**`, `/lib/wizard/**`, `/lib/ingest/**`, `/app/api/**`, `/lib/types.ts`, `/admin/upload` | Developer 1 |
| `/app/(dashboard)/**`, `/components/**`, `/lib/mock/**`, chart library | Developer 2 |
