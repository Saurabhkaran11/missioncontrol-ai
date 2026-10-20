# Integration matrix

Status is computed at runtime and shown on **Integrations**. As of 2026-10-19, **RocketRide, Masky.AI and n8n were verified against live accounts**; research (live HTTP), Tenki and Snyk were not. "Verified" refers to documentation/SDK verification (see `docs/research/sponsor-docs.md`).

| Provider | Implementation | Docs/SDK verified | Run live in this build | Default status |
|---|---|---|---|---|
| RocketRide | `src/integrations/rocketride` — `rocketride` npm SDK: `connect`, `ping`, `getServices`, `use({pipeline, token, ttl})`, `send`, `terminate` | Yes | **Yes** — cloud `ping`, `getServices`, and full missions run task-by-task on `rocketride/missioncontrol-task.pipe` | mock until `ORCHESTRATOR_PROVIDER=rocketride` |
| Masky.AI | `src/integrations/masky` — `GET /api/avatars` (health), `GET /api/avatars/{id}/images` | Yes | **Yes** — key check + 5 synthetic agent avatars (Jordan local: Creator plan limit) | mock until `AVATAR_PROVIDER=masky` |
| n8n | `src/integrations/n8n` — POST to Webhook node, Header Auth + HMAC signature + Idempotency-Key; `/healthz` | Yes | **Yes** — n8n Cloud webhook: 403 without/with wrong secret, 200 with secret, repeat send idempotent, one approved lead exported end-to-end from the app | mock until `LIVE_EXTERNAL_ACTIONS_ENABLED=true` |
| Web research | `src/integrations/research/http.ts` — plain HTTP, SSRF-guarded, domains listed on the mission only | n/a | Code path unit-tested; not run against the public web in tests | mock (demo dataset) |
| Sandbox | `src/integrations/sandbox/demo.ts` — reviewed programs only, worker thread, no env | n/a | Yes (tests) | mock |
| Tenki | Not implemented (SDK `@tenkicloud/sandbox` exists per docs) | Partially | No | not configured when selected |
| Anthropic (drafts) | `src/integrations/llm` — official `@anthropic-ai/sdk`, `claude-opus-5-5`, low effort | Yes | No | demo template |
| Snyk | CI workflow + `scripts/security-scan.sh` | Yes | No (no token locally) | not configured until a scan artifact exists |

## RocketRide
Set `ORCHESTRATOR_PROVIDER=rocketride`, `ROCKETRIDE_API_KEY`, `ROCKETRIDE_BASE_URL=https://api.rocketride.ai`, `ROCKETRIDE_PIPELINE_FILE=rocketride/missioncontrol-task.pipe` (webhook → response_text, based on the official `examples/n8n/n8n-roundtrip-target.pipe`; the envelope is sent as `text/plain` so it flows through the text lane). Each task envelope (type, agent, ids — no secrets) is sent to your pipeline under a fresh `tk_` token; the run token is stored on the mission. Typed artifacts are still produced and validated by MissionControl. **No Masky node exists in RocketRide's catalog** (verified), so Masky is called directly. RocketRide's native `tool_n8n` node could replace our webhook call; we did not, to keep a single approval-gated outbox.

## Masky.AI
`AVATAR_PROVIDER=masky`, `MASKY_API_KEY`, `MASKY_AVATAR_IDS=alex=<id>,maya=<id>,…`. Use synthetic avatars you have rights to; never clone a real person. Speech requires the conversation-turn flow (costs credits) and is not wired; the UI uses opt-in browser speech labelled "browser TTS (not Masky)".

## n8n
1. Import `docs/n8n/leads-workflow.json` (Webhook → Google Sheets *appendOrUpdate* keyed on `idempotencyKey` → Respond to Webhook). The Sheets column mapping and `__rl` locator fields are **unverified** — re-select the sheet in the n8n UI after import.
2. Create a Header Auth credential with header name `x-missioncontrol-secret` and your secret.
3. In MissionControl → Integrations: save webhook URL, base URL and the same secret (requires `INTEGRATION_ENCRYPTION_KEY`), then **Run safe test** (calls `/healthz` only).
4. Set `LIVE_EXTERNAL_ACTIONS_ENABLED=true`. Until then exports stay mock and say so.
Optional callback: n8n may POST `{eventId, idempotencyKey, status}` to `/api/v1/webhooks/n8n` with `x-missioncontrol-timestamp` and `x-missioncontrol-signature: sha256=HMAC(secret, ts + "." + body)`.

## Web research
`WEB_RESEARCH_PROVIDER=http`. Only domains you list on a mission are fetched (homepage, ≤1 MB, 8 s timeout, ≤3 redirects, each hop re-checked). Signals are keyword-derived and marked as inferences unless verbatim. Residual risk: DNS rebinding between lookup and connect — use an egress proxy in production.
