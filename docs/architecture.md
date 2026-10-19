# Architecture

```text
Browser ──> Next.js UI + /api/v1 (route() wrapper: auth, org membership, role, CSRF origin check, rate limit, zod)
              │
              ├─ services (missions, leads/approvals/exports, integrations, analytics, org)  ← every query scoped by organization_id
              ├─ PostgreSQL (Drizzle): missions, mission_tasks, task_dependencies, agent_events, leads,
              │   evidence_sources, outreach_drafts, review_findings, approval_requests/decisions,
              │   webhook_deliveries (outbox), jobs (queue), audit_log, usage_records, product_events
              └─ durable worker (jobs table, FOR UPDATE SKIP LOCKED, backoff, dead-letter)
                    └─ engine.runTask → AgentOrchestrator (local demo | RocketRide SDK)
                          ├─ ResearchProvider (demo .example dataset | HTTP + SSRF guard)
                          ├─ SandboxProvider (reviewed programs in a resource-limited worker thread)
                          ├─ DraftWriter (template | Anthropic Messages API)
                          ├─ Sam's checks (features/review.ts, pure functions)
                          └─ approval gate → outbox → LeadSink (mock | n8n webhook, HMAC-signed)
Snyk: CI only (.github/workflows/security.yml).
```

## Task graph
`alex.plan → maya.research → leo.qualify → sophia.draft → sam.review [→ sophia.revise → sam.recheck] → alex.request_approvals → (human) → jordan.export → alex.summarize`.
Revision steps are inserted at runtime only when Sam returns `revise`; a second failure goes to a human (`block`). Human "request revision" adds a new Sophia → Sam → Alex chain.

## Schema decisions
- UUID PKs; `organization_id` on every tenant row, `ON DELETE CASCADE` from `organizations` (workspace deletion removes everything).
- Explicit Postgres enums for every status.
- `agent_events.seq` is an identity column → SSE `Last-Event-ID` resume.
- `leads (organization_id, dedupe_key)` unique where status ≠ duplicate — duplicates are recorded, not dropped.
- `approval_requests` store an immutable payload snapshot + SHA-256 (`payload_hash`); deliveries use `approvalId:hash` as a unique idempotency key.
- `review_findings` is append-only (no update path) — Sam cannot edit its own results.
- Credentials: `integration_connections.secret_ciphertext` (AES-256-GCM, versioned key), never selected into API responses.

## Embedded vs separate worker
Without `DATABASE_URL`, PGlite is single-process, so `instrumentation.ts` starts the worker inside the web process. With `DATABASE_URL`, run `npm run worker` as its own service (`EMBEDDED_WORKER=false`).
