# MissionControl AI — submission

**Track:** Business, Growth & Productivity
**Repo:** https://github.com/Saurabhkaran11/missioncontrol-ai
**Demo video:** `demo/missioncontrol-demo.webm` (2 min, captioned)

## Short description (≈60 words)
MissionControl AI gives early-stage B2B SaaS founders a supervised AI operations team. Six synthetic agents work together to find prospects:
- Alex plans the mission.
- Maya researches the segment with sources.
- Leo scores and de-duplicates prospects.
- Sophia drafts outreach linked to evidence.
- Sam challenges every claim.
- Jordan exports to your CRM via n8n, only after you approve the exact version.

Every fact is cited, and nothing leaves without a human decision.

## One-liner
A supervised AI ops team for your first sales pipeline: cited research, a reviewer that pushes back, and nothing exported without your approval.

## What's real (verified live on 2026-10-19)
- **RocketRide:** mission tasks run on RocketRide cloud via the official SDK and a webhook → response pipeline.
- **Masky.AI:** five agents have synthetic Masky avatars.
- **n8n:** approved leads are sent to an n8n Cloud webhook. It authenticates with header auth plus an HMAC signature and writes to Google Sheets. Repeated sends update the same row.
- **Snyk:** CI workflow configured; the scan runs once `SNYK_TOKEN` is set.

## What's sample/mock (labelled in the app)
- Prospect companies are fictional `.example` businesses.
- Seeded sample exports are mock.
- The code sandbox only runs fixed, reviewed programs.

## 60-second demo script
1. Landing page → Integrations: RocketRide, Masky and n8n show **connected (live)**.
2. Live mission room:
   - Alex assigns the work.
   - Tasks run on RocketRide.
   - Maya → Leo → Sophia → Sam handoffs stream in.
3. Completed mission:
   - Sam sends Ledgerline's unsupported "expanding into Europe" claim back to Sophia, who revises it.
   - Quillstack's prompt injection is flagged, not obeyed.
4. Approvals: evidence, draft and Sam's verdict side by side → approve payload v1.
5. Send approved records to the pipeline → Jordan delivers to n8n → a row appears in Google Sheets.
