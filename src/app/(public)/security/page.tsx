import type { Metadata } from "next";
import { providers } from "@/integrations";
import { env } from "@/shared/env";
import { Card, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Security & trust" };
export const dynamic = "force-dynamic";

/** Describes controls that actually exist in this codebase — no compliance claims. */
export default async function Security() {
  const p = providers();
  const e = env();
  const [research, sandbox] = await Promise.all([
    p.research.health(),
    p.sandbox.health(),
  ]);
  const rows = [
    {
      name: "Agent orchestration",
      status: p.orchestrator.mode === "demo" ? "mock" : "connected",
      detail:
        p.orchestrator.mode === "demo"
          ? "Local demo orchestrator"
          : "RocketRide (configured by operator)",
    },
    {
      name: "Agent avatars & voice",
      status: p.avatars.mode === "demo" ? "mock" : "connected",
      detail:
        p.avatars.mode === "demo"
          ? "Local avatars, opt-in browser voice"
          : "Masky.AI",
    },
    {
      name: "Lead export (n8n)",
      status: e.LIVE_EXTERNAL_ACTIONS_ENABLED ? "connected" : "mock",
      detail: e.LIVE_EXTERNAL_ACTIONS_ENABLED
        ? "Live external writes enabled by operator"
        : "External writes disabled; exports are mock and labelled",
    },
    { name: "Web research", status: research.status, detail: research.message },
    { name: "Code sandbox", status: sandbox.status, detail: sandbox.message },
  ];
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        Security & trust
      </h1>
      <p className="mt-3 text-ink-2">
        What this deployment actually does with your data. We make no
        certification or compliance claims; this is a prototype.
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {[
          [
            "Human approval before side effects",
            "Exports require an owner/admin approval tied to a SHA-256 hash of the exact payload. Editing a lead or draft invalidates the old approval. Messages are never sent.",
          ],
          [
            "Evidence on every claim",
            "Each fact stores source URL, title, retrieval time, excerpt and confidence, or is labelled an inference. A reviewer agent checks claims against excerpts.",
          ],
          [
            "Untrusted content stays data",
            "Retrieved pages are sanitised and scanned for prompt-injection text, which is flagged for human review and never followed. Tool permissions are enforced in server code, not prompts.",
          ],
          [
            "Tenant isolation",
            "Every query is scoped to your organization; ids from another workspace return 404. Automated tests cover cross-tenant reads and writes.",
          ],
          [
            "Credentials",
            "Integration secrets are AES-256-GCM encrypted at rest with a versioned key and are never returned by any API, logged or sent to a model.",
          ],
          [
            "Your data, your call",
            "Owners can export all workspace data as JSON or delete the workspace, which cascades to every mission, lead, draft and approval.",
          ],
        ].map(([t, b]) => (
          <Card key={t} className="p-5">
            <h2 className="font-medium">{t}</h2>
            <p className="mt-2 text-sm text-muted">{b}</p>
          </Card>
        ))}
      </div>
      <h2 className="mt-12 text-lg font-semibold">
        Current integration status on this deployment
      </h2>
      <Card className="mt-3 divide-y divide-line">
        {rows.map((r) => (
          <div
            key={r.name}
            className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
          >
            <span className="font-medium">{r.name}</span>
            <span className="flex items-center gap-3 text-muted">
              <span className="hidden sm:inline">{r.detail}</span>
              <StatusBadge status={r.status} />
            </span>
          </div>
        ))}
      </Card>
      <p className="mt-4 text-xs text-muted">
        Dependency, source, container and IaC scanning runs with Snyk in CI; see
        the repository’s docs/security.md for the latest results and accepted
        risks.
      </p>
    </div>
  );
}
