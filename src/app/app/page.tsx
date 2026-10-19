import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db/client";
import { currentContext } from "@/server/auth";
import { listMissions } from "@/server/services/missions";
import { orgMetrics } from "@/server/services/analytics";
import { getProfile } from "@/server/services/org";
import { listIntegrations } from "@/server/services/integrations";
import { AgentAvatar } from "@/components/agent-avatar";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  SampleBadge,
  Stat,
  StatusBadge,
  timeAgo,
} from "@/components/ui";
import { AGENTS, AGENT_ORDER } from "@/features/agents/profiles";
import { and, eq, inArray } from "drizzle-orm";

export default async function Dashboard() {
  const auth = (await currentContext())!;
  const db = await getDb();
  const profile = await getProfile(db, auth.orgId);
  if (!profile) redirect("/app/onboarding");
  const [missions, metrics, integrations] = await Promise.all([
    listMissions(db, auth.orgId),
    orgMetrics(db, auth.orgId),
    listIntegrations(db, auth.orgId),
  ]);
  // Current team status: each agent's most recent running/queued task across active missions.
  const active = missions
    .filter((m) =>
      ["queued", "running", "needs_approval", "paused", "blocked"].includes(
        m.status,
      ),
    )
    .map((m) => m.id);
  const activeTasks = active.length
    ? await db
        .select()
        .from(schema.missionTasks)
        .where(
          and(
            eq(schema.missionTasks.organizationId, auth.orgId),
            inArray(schema.missionTasks.missionId, active),
            inArray(schema.missionTasks.status, [
              "running",
              "queued",
              "retrying",
              "needs_approval",
            ]),
          ),
        )
    : [];
  const checklist = [
    {
      done: true,
      label: "Describe your product and ICP",
      href: "/app/onboarding",
    },
    {
      done: missions.length > 0,
      label: "Run your first mission",
      href: "/app/missions/new",
    },
    {
      done: metrics.decisions.approve > 0,
      label: "Approve a lead",
      href: "/app/approvals",
    },
    {
      done:
        integrations.find((i) => i.provider === "n8n")?.status === "connected",
      label: "Connect n8n for live exports",
      href: "/app/integrations",
    },
  ];

  return (
    <>
      <PageHeader
        title="Mission Control"
        sub={`Your AI operations team for ${profile.companyName}. Agents prepare work; you make the decisions.`}
        actions={<ButtonLink href="/app/missions/new">New mission</ButtonLink>}
      />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Companies researched" value={metrics.researched} />
        <Stat label="Qualified" value={metrics.qualified} />
        <Stat label="Need your review" value={metrics.needsReview} />
        <Stat label="Drafts ready (not sent)" value={metrics.draftsReady} />
        <Stat label="Approved by you" value={metrics.approved} />
        <Stat
          label="Exported"
          value={metrics.exportedLive + metrics.exportedMock}
          hint={
            metrics.exportedMock
              ? `${metrics.exportedMock} mock / ${metrics.exportedLive} live`
              : undefined
          }
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Recent missions"
            sub="Progress is computed from completed tasks"
          />
          {missions.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No missions yet"
                body="Start with the guided template: find 20 prospects, qualify them and draft outreach."
                action={
                  <ButtonLink href="/app/missions/new">
                    Start your first mission
                  </ButtonLink>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {missions.slice(0, 8).map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/app/missions/${m.id}`}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{m.title}</span>
                        {m.isSample && <SampleBadge label="Sample" />}
                        {m.mode === "demo" && <Badge>demo mode</Badge>}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div
                          className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-2"
                          role="progressbar"
                          aria-valuenow={m.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${m.title} progress`}
                        >
                          <div
                            className="h-full bg-accent"
                            style={{ width: `${m.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted">
                          {m.progress}% · {timeAgo(m.createdAt)}
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={m.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Team status"
              sub="Synthetic AI agents · live from task records"
            />
            <ul className="divide-y divide-line">
              {AGENT_ORDER.map((slug) => {
                const t =
                  activeTasks.find(
                    (x) => x.agentSlug === slug && x.status === "running",
                  ) ?? activeTasks.find((x) => x.agentSlug === slug);
                return (
                  <li
                    key={slug}
                    className="flex items-center gap-3 px-5 py-2.5"
                  >
                    <AgentAvatar slug={slug} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {AGENTS[slug].displayName}{" "}
                        <span className="font-normal text-muted">
                          · {AGENTS[slug].title}
                        </span>
                      </div>
                      <div className="truncate text-xs text-muted">
                        {t ? t.title : "Idle"}
                      </div>
                    </div>
                    {t && <StatusBadge status={t.status} />}
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Setup checklist" />
            <ul className="space-y-2 p-5 text-sm">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={c.done ? "text-ok" : "text-muted"}
                  >
                    {c.done ? "✓" : "○"}
                  </span>
                  <Link
                    href={c.href}
                    className={
                      c.done
                        ? "text-muted line-through"
                        : "text-ink hover:text-accent"
                    }
                  >
                    {c.label}
                  </Link>
                  <span className="sr-only">{c.done ? "done" : "to do"}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="text-sm font-semibold">How the team works</h2>
        <p className="mt-1 text-sm text-muted">
          Alex plans and assigns → Maya researches with sources → Leo scores and
          de-duplicates → Sophia drafts with evidence links → Sam reviews and
          can send work back → you approve the exact version → Jordan exports to
          n8n. Every handoff is recorded in the mission room.
        </p>
      </Card>
    </>
  );
}
