"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AgentAvatar } from "./agent-avatar";
import { api, VoiceButton } from "./client-actions";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  StatusBadge,
  cx,
  timeAgo,
} from "./ui";
import {
  AGENTS,
  AGENT_ORDER,
  type AgentSlug,
} from "@/features/agents/profiles";

type Task = {
  id: string;
  agentSlug: string;
  taskType: string;
  title: string;
  status: string;
  attempts: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  output: Record<string, unknown> | null;
};
type Dep = { taskId: string; dependsOnTaskId: string };
type Mission = {
  id: string;
  title: string;
  goal: string;
  status: string;
  progress: number;
  mode: string;
  isSample: boolean;
  orchestrator: string;
  requestedCount: number;
  geography: string;
  createdAt: string;
};
type Ev = {
  seq: number;
  agentSlug: string | null;
  toAgentSlug: string | null;
  type: string;
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
};
type Identity = {
  slug: string;
  avatarUrl: string | null;
  providerLabel: string;
};
type Detail = {
  mission: Mission;
  tasks: Task[];
  deps: Dep[];
  leadCounts: Record<string, number>;
  pendingApprovals: number;
};

const EVENT_STYLE: Record<string, string> = {
  handoff: "border-l-accent",
  review: "border-l-warn",
  approval: "border-l-accent",
  export: "border-l-ok",
  summary: "border-l-ok",
  error: "border-l-bad",
  human: "border-l-ink",
  assignment: "border-l-line",
  status: "border-l-line",
  artifact: "border-l-line",
};

/**
 * Live mission room. Initial state is server-rendered from the database; the
 * SSE stream appends persisted events and triggers a refetch of the task
 * graph. A dropped connection resumes from the last event id, so nothing is
 * missed and the page is always reconstructible from stored records.
 */
export function MissionRoom({
  initial,
  initialEvents,
  identities,
  canWrite,
  canExport,
}: {
  initial: Detail;
  initialEvents: Ev[];
  identities: Identity[];
  canWrite: boolean;
  canExport: boolean;
}) {
  const [detail, setDetail] = useState(initial);
  const [events, setEvents] = useState(initialEvents);
  const [conn, setConn] = useState<"live" | "reconnecting" | "closed">("live");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const m = detail.mission;

  const refetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(async () => {
      try {
        setDetail(await api<Detail>(`/api/v1/missions/${m.id}`));
      } catch {
        /* keep last good state */
      }
    }, 400);
  }, [m.id]);

  useEffect(() => {
    const last = initialEvents.at(-1)?.seq ?? 0;
    const es = new EventSource(`/api/v1/missions/${m.id}/events?after=${last}`);
    es.addEventListener("agent", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as Ev;
      setEvents((prev) =>
        prev.some((p) => p.seq === ev.seq) ? prev : [...prev, ev],
      );
      refetch();
    });
    es.addEventListener("mission", (e) => {
      const s = JSON.parse((e as MessageEvent).data) as {
        status: string;
        progress: number;
      };
      setDetail((d) =>
        d.mission.status === s.status && d.mission.progress === s.progress
          ? d
          : { ...d, mission: { ...d.mission, ...s } },
      );
      setConn("live");
    });
    es.onerror = () =>
      setConn(es.readyState === EventSource.CLOSED ? "closed" : "reconnecting");
    return () => es.close();
  }, [m.id, initialEvents, refetch]);

  const act = async (action: "pause" | "resume" | "cancel") => {
    if (
      action === "cancel" &&
      !window.confirm(
        "Cancel this mission? Running steps stop and open approvals are withdrawn.",
      )
    )
      return;
    setBusy(action);
    setNotice(null);
    try {
      await api(`/api/v1/missions/${m.id}/${action}`, { method: "POST" });
      refetch();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const exportApproved = async () => {
    setBusy("export");
    setNotice(null);
    try {
      const r = await api<{ queued: number; stale: string[]; mode: string }>(
        "/api/v1/exports/n8n",
        { body: { missionId: m.id } },
      );
      setNotice(
        `Released ${r.queued} approved record${r.queued === 1 ? "" : "s"} to Jordan (${r.mode === "mock" ? "mock n8n — nothing leaves this machine" : "live n8n"}).${r.stale.length ? ` ${r.stale.length} need re-approval because they changed.` : ""}`,
      );
      refetch();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const byAgent = useMemo(() => {
    const out = {} as Record<AgentSlug, { task?: Task; last?: Ev }>;
    for (const slug of AGENT_ORDER) {
      const tasks = detail.tasks.filter((t) => t.agentSlug === slug);
      const task =
        tasks.find((t) => t.status === "running") ??
        tasks.find((t) =>
          ["queued", "retrying", "needs_approval"].includes(t.status),
        ) ??
        tasks.filter((t) => t.status === "succeeded").at(-1) ??
        tasks[0];
      const last = [...events].reverse().find((e) => e.agentSlug === slug);
      out[slug] = { task, last };
    }
    return out;
  }, [detail.tasks, events]);

  const titleOf = (id: string) => detail.tasks.find((t) => t.id === id);
  const approved = detail.leadCounts.approved ?? 0;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {m.title}
              </h1>
              <StatusBadge status={m.status} />
              {m.isSample && <Badge tone="sample">Sample</Badge>}
              <Badge tone={m.mode === "demo" ? "sample" : "accent"}>
                {m.mode === "demo" ? "demo mode · mock integrations" : "live"}
              </Badge>
              <Badge>orchestrator: {m.orchestrator}</Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted">{m.goal}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite &&
              ["running", "queued", "needs_approval"].includes(m.status) && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!!busy}
                  onClick={() => act("pause")}
                >
                  Pause
                </Button>
              )}
            {canWrite && ["paused", "blocked"].includes(m.status) && (
              <Button size="sm" disabled={!!busy} onClick={() => act("resume")}>
                {m.status === "blocked" ? "Retry & resume" : "Resume"}
              </Button>
            )}
            {canWrite &&
              !["succeeded", "cancelled", "failed"].includes(m.status) && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!!busy}
                  onClick={() => act("cancel")}
                >
                  Cancel
                </Button>
              )}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuenow={m.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Mission progress"
          >
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${m.progress}%` }}
            />
          </div>
          <span className="font-mono text-sm tabular-nums">{m.progress}%</span>
          <span
            className={cx(
              "text-xs",
              conn === "live" ? "text-muted" : "text-warn",
            )}
            aria-live="polite"
          >
            {conn === "live"
              ? "● live updates"
              : conn === "reconnecting"
                ? "reconnecting…"
                : "updates paused — refresh"}
          </span>
        </div>
        {(detail.pendingApprovals > 0 || approved > 0) && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-accent-soft px-4 py-3 text-sm">
            <span className="text-ink">
              <strong>{detail.pendingApprovals}</strong> awaiting your approval
              · <strong>{approved}</strong> approved, not yet exported
            </span>
            <ButtonLink href={`/app/approvals?mission=${m.id}`} size="sm">
              Review approvals
            </ButtonLink>
            {canExport && approved > 0 && (
              <Button
                size="sm"
                variant="secondary"
                disabled={!!busy}
                onClick={exportApproved}
              >
                {busy === "export" ? "Releasing…" : "Send approved to pipeline"}
              </Button>
            )}
          </div>
        )}
        {notice && (
          <p role="status" className="mt-3 text-sm text-ink-2">
            {notice}
          </p>
        )}
      </Card>

      <section aria-label="Agent team">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {AGENT_ORDER.map((slug) => {
            const a = AGENTS[slug];
            const { task, last } = byAgent[slug];
            const id = identities.find((i) => i.slug === slug);
            const working = task?.status === "running";
            return (
              <li
                key={slug}
                className={cx(
                  "rounded-xl bg-surface p-4 ring-1",
                  working ? "ring-accent/40" : "ring-line",
                )}
              >
                <div className="flex items-start gap-3">
                  <AgentAvatar
                    slug={slug}
                    size={44}
                    avatarUrl={id?.avatarUrl}
                    className={working ? "mc-pulse" : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">
                        {a.displayName}{" "}
                        <span className="text-sm font-normal text-muted">
                          · {a.title}
                        </span>
                      </div>
                      {task && <StatusBadge status={task.status} />}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted">
                      {task ? task.title : "No task in this mission"}
                    </div>
                  </div>
                </div>
                <p className="mt-3 min-h-10 text-sm text-ink-2">
                  {last ? (
                    last.message
                  ) : (
                    <span className="text-muted">
                      Waiting for an assignment.
                    </span>
                  )}
                </p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                  <span title="Avatar and voice provider">
                    {id?.providerLabel ?? "Local avatar"} · synthetic agent
                  </span>
                  {last && (
                    <VoiceButton
                      text={`${a.displayName}: ${last.message}`}
                      lang={a.voice.language}
                      rate={a.voice.rate}
                      pitch={a.voice.pitch}
                      agentName={a.displayName}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader
            title="Task graph"
            sub="Persisted DAG · revision steps appear when Sam sends work back"
          />
          <ol className="divide-y divide-line">
            {detail.tasks.map((t) => {
              const deps = detail.deps
                .filter((d) => d.taskId === t.id)
                .map((d) => titleOf(d.dependsOnTaskId))
                .filter(Boolean) as Task[];
              return (
                <li key={t.id} className="flex items-start gap-3 px-5 py-3">
                  <AgentAvatar slug={t.agentSlug} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{t.title}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      <code className="font-mono">{t.taskType}</code>
                      {deps.length > 0 && (
                        <>
                          {" "}
                          · after{" "}
                          {deps
                            .map(
                              (d) =>
                                AGENTS[d.agentSlug as AgentSlug]?.displayName +
                                ": " +
                                d.title.split(" ").slice(0, 3).join(" "),
                            )
                            .join(", ")}
                        </>
                      )}
                      {t.attempts > 1 && <> · attempt {t.attempts}</>}
                    </div>
                    {t.errorMessage && (
                      <div className="mt-1 text-xs text-bad">
                        {t.errorMessage}
                      </div>
                    )}
                    {t.status === "needs_approval" && (
                      <div className="mt-1 text-xs text-accent">
                        Waiting for your approvals before Jordan can export.
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        <Card>
          <CardHeader
            title="Activity & handoffs"
            sub="Concise status updates and structured handoffs — no hidden model reasoning"
            action={
              <Link
                href={`/app/leads?mission=${m.id}`}
                className="text-xs text-accent hover:underline"
              >
                View leads →
              </Link>
            }
          />
          <ol
            className="max-h-[640px] space-y-2 overflow-y-auto p-4"
            aria-live="polite"
            aria-relevant="additions"
          >
            {[...events].reverse().map((e) => (
              <li
                key={e.seq}
                className={cx(
                  "rounded-lg border-l-4 bg-surface-2/60 px-3 py-2",
                  EVENT_STYLE[e.type] ?? "border-l-line",
                )}
              >
                <div className="flex items-center gap-2 text-xs text-muted">
                  {e.agentSlug ? (
                    <AgentAvatar slug={e.agentSlug} size={18} />
                  ) : (
                    <span aria-hidden>👤</span>
                  )}
                  {e.toAgentSlug && (
                    <>
                      <span aria-hidden>→</span>
                      <AgentAvatar slug={e.toAgentSlug} size={18} />
                      <span className="sr-only">to {e.toAgentSlug}</span>
                    </>
                  )}
                  <span className="font-medium uppercase tracking-wide">
                    {e.type}
                  </span>
                  <span className="ml-auto">{timeAgo(e.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm text-ink">{e.message}</p>
                {e.type === "handoff" &&
                  Array.isArray(
                    (e.data as { criteria?: unknown[] }).criteria,
                  ) && (
                    <ul className="mt-1 list-disc pl-5 text-xs text-ink-2">
                      {(
                        e.data as {
                          criteria: {
                            criterion: string;
                            detail: string;
                            sources: number;
                          }[];
                        }
                      ).criteria.map((c) => (
                        <li key={c.criterion}>
                          {c.criterion}: {c.detail}{" "}
                          <span className="text-muted">
                            ({c.sources} source{c.sources === 1 ? "" : "s"})
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
              </li>
            ))}
            {events.length === 0 && (
              <li className="text-sm text-muted">No activity yet.</li>
            )}
          </ol>
        </Card>
      </div>
    </div>
  );
}
