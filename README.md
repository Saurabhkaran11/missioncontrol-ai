# MissionControl AI

A supervised AI operations team for early-stage B2B SaaS founders. You state a goal. Six synthetic agents then do the work:

1. **Alex** plans the work.
2. **Maya** researches the market with sources.
3. **Leo** finds and scores prospects, and removes duplicates.
4. **Sophia** drafts outreach linked to evidence.
5. **Sam** reviews every claim and sends weak work back.
6. **Jordan** exports to n8n — only the exact records **you** approved.

Hackathon prototype (Business, Growth & Productivity track). **Not production-ready**; see `docs/security.md` for residual risks.

## Quick start (zero credentials)
```bash
npm install
npm run dev            # http://localhost:3000 — embedded Postgres (PGlite) + embedded worker
```
Open the site → **Open the live demo**. Each visitor gets an isolated, clearly labelled sample workspace. It contains:
- one completed mission, including a Sam revision, a blocked prompt injection, approvals and a mock n8n delivery;
- one mission running live.

Other commands:
```bash
npm test               # 48 tests: unit, security, provider contracts, Postgres integration, tenant isolation, e2e
npm run lint && npm run typecheck && npm run build
npm run db:seed        # canonical sample workspace (refuses when DEMO_MODE=false)
npm run db:reset       # wipe local PGlite and reseed (stop the dev server first)
docker compose up --build   # Postgres + web + separate worker
SNYK_TOKEN=… npm run security:snyk
```
Configuration: copy `.env.example` → `.env.local`. Every provider defaults to a labelled demo implementation.

## What's real vs mock
See `docs/integrations.md`. Summary:
- **Mission engine** — real: the task graph, durable queue, retries, SSE, approvals, outbox, and Sam's evidence checks.
- **Demo research** — uses fictional `.example` companies.
- **Live HTTP research** — available; it is SSRF-guarded.
- **Sponsor adapters** — RocketRide (SDK), Masky (REST) and n8n (webhook) are implemented from verified docs. None has been run against a live account in this build.
- **Not implemented:**
  - the Tenki sandbox;
  - Masky speech (browser TTS is used and labelled as such);
  - the Supabase sign-in UI (local dev sign-in is used in demo mode).

## Project layout
- `src/app` — pages and `/api/v1` routes.
- `src/server` — auth, the API wrapper and services.
- `src/workers` — the queue, engine and worker.
- `src/features` — pure domain rules.
- `src/integrations` — provider adapters.
- `src/db` — the schema and seed.
- `drizzle/` — migrations.
- `tests/missioncontrol.test.ts` — the single test file.
- `docs/` — the documents listed under Docs below.

## API (v1, cookie-authenticated, JSON, errors `{error:{code,message,correlationId}}`)
| Method & path | Purpose |
|---|---|
| `POST/GET /api/v1/missions` | Create (validated, rate-limited) / list |
| `GET /api/v1/missions/:id` | Detail: tasks, DAG edges, lead counts |
| `POST /api/v1/missions/:id/{start,pause,resume,cancel}` | Idempotent lifecycle |
| `GET /api/v1/missions/:id/events` | SSE from persisted events (`Last-Event-ID` resume) |
| `GET /api/v1/missions/:id/leads`, `GET/PATCH /api/v1/leads/:id` | Review/edit with optimistic concurrency + audit |
| `GET /api/v1/approvals`, `POST /api/v1/approvals/:id/decision`, `POST /api/v1/approvals/bulk` | Decide one exact payload hash; bulk needs `confirm: true` |
| `GET /api/v1/integrations`, `PUT /api/v1/integrations/n8n`, `POST /api/v1/integrations/:provider/test` | Status, setup (secrets write-only), safe tests |
| `POST /api/v1/exports/n8n` | Outbox export of approved, current payloads only |
| `GET /api/v1/exports/leads.csv` | Tenant-scoped CSV with formula escaping |
| `POST /api/v1/webhooks/n8n` | Signed, timestamped, replay-protected callback |
| `GET /api/health`, `GET /api/ready` | Liveness / readiness + queue depth |

## Claude Code agents
Six project subagents in `.claude/agents/` help **build and review** this codebase. They are developer assistants, not the runtime product agents. If `.claude/agents/` did not exist when your Claude Code session started, restart Claude Code to load them. Syntax may change; check https://code.claude.com/docs/en/sub-agents.

| Agent file / name | Purpose | Interactive one-off invocation | Start a dedicated Claude Code session |
|---|---|---|---|
| `.claude/agents/alex-orchestrator.md` / `alex-orchestrator` | Mission state machine, task graph, orchestration contracts | `@agent-alex-orchestrator Design or review the mission lifecycle and orchestration handoffs.` | `claude --agent alex-orchestrator` |
| `.claude/agents/maya-researcher.md` / `maya-researcher` | Browser research adapter, source evidence, citation quality | `@agent-maya-researcher Implement or review source-backed research and evidence capture.` | `claude --agent maya-researcher` |
| `.claude/agents/leo-lead-qualifier.md` / `leo-lead-qualifier` | Lead schema, deduplication, scoring, ICP qualification | `@agent-leo-lead-qualifier Implement or review lead qualification, scoring, and deduplication.` | `claude --agent leo-lead-qualifier` |
| `.claude/agents/sophia-outreach.md` / `sophia-outreach` | Evidence-linked outreach drafts and safe copy workflow | `@agent-sophia-outreach Implement or review editable outreach drafts and their evidence links; do not send messages.` | `claude --agent sophia-outreach` |
| `.claude/agents/sam-quality-security.md` / `sam-quality-security` | Read-only quality, security, privacy, and Snyk review | `@agent-sam-quality-security Review the changed code for security, privacy, evidence integrity, and Snyk coverage; report findings without editing files.` | `claude --agent sam-quality-security` |
| `.claude/agents/jordan-revops.md` / `jordan-revops` | n8n/CRM approval-gated export, integrations, analytics, GTM | `@agent-jordan-revops Implement or review the approval-gated n8n export and revenue-operations surfaces.` | `claude --agent jordan-revops` |

## Docs
- `docs/implementation-plan.md`
- `docs/architecture.md`
- `docs/integrations.md`
- `docs/security.md`
- `docs/operations.md`
- `docs/gtm-plan.md`
- `docs/research/sponsor-docs.md`
