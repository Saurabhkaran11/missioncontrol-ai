import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { currentContext } from "@/server/auth";
import { members } from "@/server/services/org";
import { recentAudit } from "@/server/services/integrations";
import { currentPeriod } from "@/server/audit";
import { roleCan } from "@/features/approval-policy";
import { DangerZone, InviteForm } from "@/components/settings-panel";
import { Badge, Card, CardHeader, PageHeader, timeAgo } from "@/components/ui";

export default async function Settings() {
  const auth = (await currentContext())!;
  const db = await getDb();
  const [team, auditRows, [org]] = await Promise.all([
    members(db, auth.orgId),
    recentAudit(db, auth.orgId, 30),
    db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, auth.orgId)),
  ]);
  const usage = await db
    .select({
      metric: schema.usageRecords.metric,
      n: sql<number>`sum(${schema.usageRecords.quantity})::int`,
    })
    .from(schema.usageRecords)
    .where(
      and(
        eq(schema.usageRecords.organizationId, auth.orgId),
        eq(schema.usageRecords.period, currentPeriod()),
      ),
    )
    .groupBy(schema.usageRecords.metric);
  const u = Object.fromEntries(usage.map((x) => [x.metric, x.n]));
  return (
    <>
      <PageHeader
        title="Settings & team"
        sub={`${auth.orgName} · you are ${auth.role}`}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Members"
            sub="Owners & admins approve and export; members run missions and edit leads"
          />
          <ul className="divide-y divide-line">
            {team.members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between px-5 py-2.5 text-sm"
              >
                <span>
                  {m.name} <span className="text-muted">· {m.email}</span>
                </span>
                <Badge>{m.role}</Badge>
              </li>
            ))}
            {team.invites
              .filter((i) => !i.acceptedAt)
              .map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between px-5 py-2.5 text-sm text-muted"
                >
                  <span>{i.email} (invited)</span>
                  <Badge>{i.role}</Badge>
                </li>
              ))}
          </ul>
          {roleCan(auth.role, "members.manage") && (
            <div className="border-t border-line p-5">
              <InviteForm />
            </div>
          )}
        </Card>
        <Card>
          <CardHeader
            title="Workspace & usage"
            sub={`Period ${currentPeriod()} · limits are enforced server-side`}
          />
          <dl className="grid grid-cols-2 gap-y-2 p-5 text-sm">
            <dt className="text-muted">Missions started</dt>
            <dd className="font-mono">
              {u.mission_started ?? 0} / {org.monthlyMissionLimit}
            </dd>
            <dt className="text-muted">Companies researched</dt>
            <dd className="font-mono">{u.lead_researched ?? 0}</dd>
            <dt className="text-muted">Records exported</dt>
            <dd className="font-mono">{u.export ?? 0}</dd>
            <dt className="text-muted">Billing</dt>
            <dd>
              Not enabled —{" "}
              <Link className="text-accent hover:underline" href="/pricing">
                pricing is a hypothesis
              </Link>
            </dd>
          </dl>
          <div className="border-t border-line px-5 py-3 text-sm">
            <Link
              href="/app/onboarding"
              className="text-accent hover:underline"
            >
              Edit product, ICP and tone →
            </Link>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader
            title="Audit history"
            sub="Approvals, exports, integration changes and other sensitive actions"
          />
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {auditRows.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 text-sm"
              >
                <span>
                  <code className="font-mono text-xs">{a.action}</code>{" "}
                  <span className="text-muted">
                    by {a.actorType}
                    {a.actorType === "agent" ? ` ${a.actorId}` : ""}
                    {a.targetType ? ` on ${a.targetType}` : ""}
                  </span>
                </span>
                <span className="text-xs text-muted">
                  {timeAgo(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        {roleCan(auth.role, "data.delete") && (
          <div className="lg:col-span-2">
            <DangerZone orgName={auth.orgName} />
          </div>
        )}
      </div>
    </>
  );
}
