# Deployment & operations runbook

Nothing is deployed automatically. Recommended topology: container web service + separate worker service + managed PostgreSQL (e.g. Supabase/Neon/RDS).

## Environments
| | staging | production |
|---|---|---|
| DEMO_MODE | true (optional) | **false** |
| LIVE_EXTERNAL_ACTIONS_ENABLED | false until tested | false until an operator configures + tests n8n |
| DATABASE_URL | managed Postgres | managed Postgres (PITR backups on) |
| SESSION_SECRET / INTEGRATION_ENCRYPTION_KEY | from secret manager | from secret manager |

Startup fails with a redacted message when production lacks required settings (`src/shared/env.ts`).

## Deploy
1. Build: `docker build --target runtime -t mc-web .` and `docker build --target worker -t mc-worker .`
2. Migrate (one-off job, before rollout): `npm run db:migrate` with `DATABASE_URL`.
3. Roll out web (`EMBEDDED_WORKER=false`) behind TLS; health `GET /api/health`, readiness `GET /api/ready` (DB + queue depth).
4. Roll out worker (`WORKER_CONCURRENCY`), ≥1 replica; multiple replicas are safe (SKIP LOCKED).
5. Serverless hosts (e.g. Vercel) can run the web app; the worker must run elsewhere as a long-lived process.

## Migrations
Additive first (new columns nullable/defaulted), deploy code, backfill, then tighten. Generate with `npm run db:generate`; review SQL before merging. Never edit an applied migration.

## Backups & restore
Enable provider PITR. Restore drill: restore to a new instance, point staging at it, run `/api/ready` and the test suite against it.

## Rollback
Redeploy previous image tags. Because migrations are additive, the previous web/worker version keeps working; roll back schema only with a reviewed down-migration.

## Observability
Structured JSON logs with redaction (`src/shared/logger.ts`) and `x-correlation-id` on every API response. Watch: `/api/ready` queue counts (queued/running/dead), `webhook_deliveries` in `dead`, tasks `failed`. `SENTRY_DSN` is reserved; no SDK is wired yet.

## Supabase Auth (production sign-in)
Not wired in this prototype's UI. Plan: `@supabase/ssr` (installed) → magic-link sign-in → callback maps `auth.users.id` to `users.auth_subject` and issues the MissionControl session cookie. Until then production has no sign-in path, which is deliberate rather than falling back to the demo login.
