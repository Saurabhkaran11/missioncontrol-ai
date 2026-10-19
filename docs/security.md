# Security, privacy & reliability

| Control | Where | Tested |
|---|---|---|
| Session cookies: random 256-bit token, httpOnly, SameSite=Lax, Secure in prod; DB stores SHA-256 only | `src/server/auth.ts` | via flows |
| Org isolation on every query; foreign ids → 404 | services/*.ts | yes (cross-tenant read + write) |
| Role permissions (owner/admin/member) server-side | `features/approval-policy.ts`, `server/api.ts` | yes |
| CSRF: state-changing requests must carry our Origin | `server/api.ts` | manual |
| Input validation (zod, size limits) + consistent error shape with correlation id | `shared/schemas.ts`, `server/api.ts` | yes |
| Approval bound to SHA-256 of exact payload; stale → refused | engine + leads service | yes |
| Idempotent export (`approvalId:hash` unique) | outbox | yes |
| Webhook HMAC (constant-time), 5-min window, replay table | `shared/crypto.ts`, `/api/v1/webhooks/n8n` | yes |
| SSRF guard (scheme, port, credentials, private/metadata IPs, every redirect) | `integrations/research/ssrf.ts` | yes |
| Prompt-injection: retrieved text flagged, never followed; tool allowlists in code | `features/evidence.ts`, `assertAgentMay` | yes |
| CSV formula-injection escaping | `csvCell` | yes |
| XSS: React escaping, no `dangerouslySetInnerHTML`; CSP, frame-ancestors none | `next.config.ts` | — |
| Credential encryption AES-256-GCM with key version; never returned | `shared/crypto.ts`, integrations service | yes |
| Log redaction + truncation | `shared/logger.ts` | yes |
| Rate limits (auth, missions, exports, integration tests, waitlist) | `server/ratelimit.ts` | yes |
| Bounded retries, backoff, dead-letter | `workers/queue.ts` | yes |
| Sandbox: reviewed programs only, no env, heap/time/output caps | `integrations/sandbox/demo.ts` | yes |
| Audit log: approvals, exports, integration changes, lead edits, data export/delete | `server/audit.ts` | partly |
| Data export (JSON) and workspace deletion (cascade) | `server/services/org.ts` | — |

## Snyk
- CI: `.github/workflows/security.yml` (Open Source, Code, IaC, Container, SARIF upload). Enable with repository variable `SNYK_ENABLED=true` and secret `SNYK_TOKEN` (least-privilege service account).
- Local: `SNYK_TOKEN=… npm run security:snyk` → `security-reports/snyk-summary.json`, surfaced on the Integrations page.
- **Status of this build:** Snyk has **not** been run (no token available). `npm audit --omit=dev` reported 0 vulnerabilities on 2026-10-19.
- Accepted exceptions: none. Add any to `.snyk` with `reason` and `expires` (Snyk Code findings cannot be ignored there).

## Known residual risks
- CSP allows `'unsafe-inline'` scripts (Next.js bootstrap); move to nonces for production.
- Rate limiter is per-process memory.
- No Postgres RLS yet; isolation relies on application scoping (tested). Add RLS policies keyed on a per-request `app.org_id` setting before multi-service DB access.
- DNS rebinding window in HTTP research.
- Privacy policy/terms: placeholders only — **require legal review**; no compliance is claimed.

## Key rotation
Encrypt with a new key version: deploy new `INTEGRATION_ENCRYPTION_KEY`, decrypt each `secret_ciphertext` with the old key, re-encrypt (`v2:`), then remove the old key.
