# Implementation plan & status

Assumptions (made without blocking):
- Empty starting directory → new Next.js 16 (App Router, TypeScript, Tailwind v4) project at `~/Desktop/missioncontrol-ai`.
- `cacheComponents` disabled: every product page is per-organization, per-request.
- Drizzle ORM on PostgreSQL. Zero-setup demo uses embedded PGlite (real Postgres in WASM); production uses `DATABASE_URL`.
- Sponsor APIs were researched before coding (`docs/research/sponsor-docs.md`). Only verified calls are implemented.

| # | Slice | Status |
|---|---|---|
| 1 | Inspect, checklist, visual shell, responsive nav | Done |
| 2 | Sessions, org isolation, schema + migrations, onboarding, dashboard, demo workspace | Done (Supabase hosted sign-in UI not wired — see Known gaps) |
| 3 | Mission composer, lifecycle, durable Postgres queue, task DAG, SSE mission room | Done |
| 4 | Leads/evidence/drafts, Sam review + revision loop, hash-bound approvals | Done |
| 5 | RocketRide adapter (verified SDK calls) + honest status | Implemented, not run against a live RocketRide account |
| 6 | Masky identity adapter + accessible fallbacks, opt-in browser voice | Implemented, not run against a live Masky account |
| 7 | n8n setup, approval-gated outbox, idempotent export, inbound webhook | Done with mock; live path unit-tested with fakes only |
| 8 | HTTP research with SSRF guard; reviewed-program sandbox | Done; Tenki adapter not implemented |
| 9 | Snyk CI, security controls, audit/privacy, runbooks | CI config written; Snyk not run locally (no token) |
| 10 | GTM pages, seed quality, tests, deployment guide | Done |

Known gaps: Supabase Auth sign-in flow UI; Tenki sandbox adapter; Masky speech (conversation turns); shareable read-only report links; Postgres RLS policies (app-level scoping is enforced and tested; RLS is documented as a production hardening step); distributed rate limiting.
