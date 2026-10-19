import { getDb } from "@/db/client";
import { currentContext } from "@/server/auth";
import { orgMetrics } from "@/server/services/analytics";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui";

/** Funnel from stored records. Wording never upgrades a draft to "sent" or an export to "revenue". */
export default async function Analytics() {
  const auth = (await currentContext())!;
  const m = await orgMetrics(await getDb(), auth.orgId);
  const funnel = [
    {
      label: "Researched",
      value: m.researched,
      note: "Companies Leo considered, incl. duplicates and rejections",
    },
    {
      label: "Qualified",
      value: m.qualified,
      note: "Scored ≥ 65 with sufficient confidence",
    },
    {
      label: "Drafts ready",
      value: m.draftsReady,
      note: "Passed Sam's review — prepared, not sent",
    },
    {
      label: "Approved by a human",
      value: m.approved,
      note: "Exact payload version approved",
    },
    {
      label: "Exported",
      value: m.exportedLive + m.exportedMock,
      note: `${m.exportedLive} live to n8n · ${m.exportedMock} mock (demo)`,
    },
  ];
  const max = Math.max(1, ...funnel.map((f) => f.value));
  return (
    <>
      <PageHeader
        title="Results"
        sub="Computed from your workspace's stored records. These are pipeline-preparation counts — not messages sent, buyers, or revenue."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Leads with cited evidence"
          value={m.evidenceCoverage === null ? "—" : `${m.evidenceCoverage}%`}
          hint="Non-duplicate leads with ≥1 source"
        />
        <Stat label="Need human review" value={m.needsReview} />
        <Stat
          label="Median time to approval-ready"
          value={
            m.medianSecondsToApprovalReady === null
              ? "—"
              : `${m.medianSecondsToApprovalReady}s`
          }
          hint="Mission start → approval request"
        />
        <Stat
          label="Export failures"
          value={m.exportFailures}
          hint="Dead-lettered deliveries"
        />
      </div>
      <Card className="mt-6">
        <CardHeader title="Pipeline preparation funnel" />
        <ul className="space-y-3 p-5">
          {funnel.map((f) => (
            <li key={f.label}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{f.label}</span>
                <span className="font-mono tabular-nums">{f.value}</span>
              </div>
              <div
                className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2"
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(f.value / max) * 100}%` }}
                />
              </div>
              <div className="mt-0.5 text-xs text-muted">{f.note}</div>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Your decisions" sub="Human approval outcomes" />
        <div className="grid grid-cols-3 gap-3 p-5 text-center text-sm">
          {(["approve", "reject", "request_revision"] as const).map((k) => (
            <div key={k}>
              <div className="font-mono text-2xl font-semibold tabular-nums">
                {m.decisions[k] ?? 0}
              </div>
              <div className="text-xs text-muted">{k.replace("_", " ")}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
