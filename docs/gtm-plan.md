# Go-to-market plan

> Everything quantitative here is a **hypothesis to validate**, not an observed market fact.

## Who, what, why
- **Initial ICP:** B2B SaaS and AI startups with 1–20 employees, post-launch, founder-led sales, no sales-ops or research staff.
- **Buyer:** the technical or product founder who currently does prospect research at night.
- **Urgent problem:** they need a repeatable pipeline but research is slow, and generic AI output invents facts they can't send.
- **Alternatives:** manual research + spreadsheets; data vendors (lists without reasoning); AI SDR tools that auto-send; freelancers.
- **Positioning:** a *supervised* AI operations team — evidence on every claim, a reviewer that pushes back, and nothing leaves without your approval.
- **Value proposition:** hours of research returned per week, with output you can trust enough to use.
- **Proof needed:** share of leads a founder accepts; % of claims with valid evidence; review time per lead; repeat missions per week.

## Homepage message
"A supervised AI ops team for your first sales pipeline. Six specialised agents research, qualify and draft — you see every source and approve every export."

## 60-second demo script (seeded mission)
1. (0–10s) Landing → "Open the live demo". Point at the sample-data banner.
2. (10–25s) Live mission: Alex assigns, Maya hands cited criteria to Leo, Leo reports qualified/rejected/duplicates.
3. (25–40s) Completed mission activity: Sam sends Ledgerline's "expanding into Europe" back — the source doesn't say that — and Sophia revises. Quillstack's page tried a prompt injection; it was flagged, not obeyed.
4. (40–55s) Approvals: evidence, draft and Sam's verdict side by side; approve payload v1. Edit the draft → the approval is superseded.
5. (55–60s) "Send approved to pipeline" → Jordan reports a clearly labelled **mock** n8n delivery.

## 30 / 60 / 90 days
- **0–30:** 20 founder interviews (problem, current workflow, trust threshold). Recruit 5 design partners from personal network and founder communities. Run real missions with them weekly by hand alongside the product.
- **31–60:** One narrow acquisition test: founder-community posts + a public "teardown" of how Sam catches unsupported claims; measure demo → first mission. Fix onboarding friction seen in sessions (ICP wording, n8n setup).
- **61–90:** Live research provider + n8n setups for partners; decide pricing from willingness-to-pay interviews; only then test a small paid channel.

## Pricing hypotheses (see `src/features/gtm/pricing.ts`)
Founder $49/mo, Team $149/mo, design partners free for 90 days. Validation questions: unit of value (missions vs approved leads vs seats); premium for live CRM export; acceptable review time per lead.

## Metrics (definitions)
- **North star:** approved leads per active organization per week.
- **First mission started:** orgs with ≥1 `mission_started` event / orgs created.
- **Mission completion rate:** missions reaching `needs_approval` or `succeeded` / missions started.
- **Evidence coverage:** non-duplicate leads with ≥1 evidence source / non-duplicate leads (shown on Results).
- **Review/approval rate:** approve decisions / all decisions.
- **Time to first usable result:** median seconds from mission start to approval request (shown on Results).
- **Export completion rate:** delivered / (delivered + dead) deliveries.
- **Weekly retained orgs:** orgs with a decision in week N and N+1.
- **Paid conversion:** only once real billing exists (none today).
Instrumentation: `product_events` (event names + scalar props, no PII), `usage_records`, and the records themselves.

## Risks & experiments
| Risk | Experiment |
|---|---|
| Research accuracy on the real web | Blind-score 50 live leads per partner; target ≥80% "would contact". |
| Customer trust | Track % of drafts edited before approval and why. |
| Workflow setup friction (n8n) | Time-to-first-export in sessions; offer CSV first. |
| Cost per mission | Log model + research calls per mission before pricing. |
| Does review save time? | Compare founder time per qualified lead vs their manual baseline. |
