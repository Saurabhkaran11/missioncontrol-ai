import { and, eq, inArray, ne, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { schema, type DB, type Tx } from "@/db/client";
import type {
  Finding,
  LeadFact,
  Mission,
  MissionTask,
  MissionStatus,
  TaskStatus,
} from "@/db/schema";
import {
  AGENTS,
  assertAgentMay,
  type AgentSlug,
} from "@/features/agents/profiles";
import { scoreCandidate } from "@/features/scoring";
import { dedupeKey, partitionDuplicates } from "@/features/dedupe";
import { choosePersonalizations } from "@/features/drafting";
import {
  reviewDraft,
  reviewLead,
  verdictFor,
  type EvidenceInfo,
} from "@/features/review";
import {
  buildApprovalPayload,
  hashApprovalPayload,
  EXPORT_DESTINATION,
  checkExportable,
} from "@/features/approval-policy";
import {
  canMission,
  readyTasks,
  assertAcyclic,
} from "@/features/state-machine";
import { providers } from "@/integrations";
import { LocalDemoOrchestrator } from "@/integrations/rocketride";
import type { LeadExportPayload } from "@/integrations/types";
import { classifyError, AppError } from "@/shared/errors";
import { env } from "@/shared/env";
import { log } from "@/shared/logger";
import { emit } from "@/server/events";
import { audit, recordUsage } from "@/server/audit";
import { enqueue } from "./queue";

/**
 * Mission engine: builds the task DAG, runs one task per job, and advances the
 * graph. All agent-to-agent communication is persisted — a task's output is a
 * typed artifact, and every handoff is an `agent_events` row the UI renders.
 *
 *   alex.plan → maya.research → leo.qualify → sophia.draft → sam.review
 *     [→ sophia.revise → sam.recheck]   (inserted only when Sam finds problems)
 *   → alex.request_approvals → (human approves) → jordan.export → alex.summarize
 *
 * Handlers do slow provider work first and write their results in a single
 * transaction, so a retry after a crash never leaves half-written artifacts.
 */

type TaskType =
  | "alex.plan"
  | "maya.research"
  | "leo.qualify"
  | "sophia.draft"
  | "sam.review"
  | "sophia.revise"
  | "sam.recheck"
  | "alex.request_approvals"
  | "jordan.export"
  | "alex.summarize";

const PLAN: {
  type: TaskType;
  agent: AgentSlug;
  title: string;
  deps: TaskType[];
}[] = [
  {
    type: "alex.plan",
    agent: "alex",
    title: "Plan mission and assign specialists",
    deps: [],
  },
  {
    type: "maya.research",
    agent: "maya",
    title: "Research target segment with sources",
    deps: ["alex.plan"],
  },
  {
    type: "leo.qualify",
    agent: "leo",
    title: "Find, de-duplicate and score candidates",
    deps: ["maya.research"],
  },
  {
    type: "sophia.draft",
    agent: "sophia",
    title: "Draft evidence-linked outreach",
    deps: ["leo.qualify"],
  },
  {
    type: "sam.review",
    agent: "sam",
    title: "Review evidence, claims and policy",
    deps: ["sophia.draft"],
  },
  {
    type: "alex.request_approvals",
    agent: "alex",
    title: "Request human approval",
    deps: ["sam.review"],
  },
  {
    type: "jordan.export",
    agent: "jordan",
    title: "Send approved records to n8n",
    deps: ["alex.request_approvals"],
  },
  {
    type: "alex.summarize",
    agent: "alex",
    title: "Summarise results and open items",
    deps: ["jordan.export"],
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Demo pacing makes the live mission room watchable; seeding skips it.
const g = globalThis as unknown as { __mcNoPace?: Set<string> };
export const noPace = (g.__mcNoPace ??= new Set<string>());
const seedOrchestrator = new LocalDemoOrchestrator();
let pacingMission: string | null = null;
const pace = () =>
  pacingMission && noPace.has(pacingMission)
    ? Promise.resolve()
    : sleep(env().DEMO_STEP_DELAY_MS);

// ---------------------------------------------------------------- graph ops

export async function createTaskGraph(db: DB | Tx, mission: Mission) {
  const existing = await db
    .select({ id: schema.missionTasks.id })
    .from(schema.missionTasks)
    .where(eq(schema.missionTasks.missionId, mission.id))
    .limit(1);
  if (existing.length) return; // idempotent: start/resume never duplicates the graph
  const ids = new Map<TaskType, string>();
  PLAN.forEach((p) => ids.set(p.type, crypto.randomUUID()));
  await db.insert(schema.missionTasks).values(
    PLAN.map((p, i) => ({
      id: ids.get(p.type)!,
      organizationId: mission.organizationId,
      missionId: mission.id,
      agentSlug: p.agent,
      taskType: p.type,
      title: p.title,
      status: "pending" as TaskStatus,
      position: i * 10,
      idempotencyKey: `${mission.id}:${p.type}:1`,
    })),
  );
  const edges = PLAN.flatMap((p) =>
    p.deps.map((d) => ({
      organizationId: mission.organizationId,
      taskId: ids.get(p.type)!,
      dependsOnTaskId: ids.get(d)!,
    })),
  );
  assertAcyclic([...ids.values()], edges);
  await db.insert(schema.taskDependencies).values(edges);
}

async function addTask(
  tx: Tx,
  mission: Mission,
  t: {
    type: TaskType;
    agent: AgentSlug;
    title: string;
    deps: string[];
    input?: Record<string, unknown>;
    position: number;
  },
) {
  const id = crypto.randomUUID();
  const n = await tx
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.missionTasks)
    .where(
      and(
        eq(schema.missionTasks.missionId, mission.id),
        eq(schema.missionTasks.taskType, t.type),
      ),
    );
  await tx.insert(schema.missionTasks).values({
    id,
    organizationId: mission.organizationId,
    missionId: mission.id,
    agentSlug: t.agent,
    taskType: t.type,
    title: t.title,
    status: "pending",
    input: t.input ?? {},
    position: t.position,
    idempotencyKey: `${mission.id}:${t.type}:${(n[0]?.c ?? 0) + 1}`,
  });
  if (t.deps.length)
    await tx.insert(schema.taskDependencies).values(
      t.deps.map((d) => ({
        organizationId: mission.organizationId,
        taskId: id,
        dependsOnTaskId: d,
      })),
    );
  return id;
}

/** Enqueues every pending task whose dependencies have all succeeded. */
export async function scheduleReady(db: DB, missionId: string) {
  const [mission] = await db
    .select()
    .from(schema.missions)
    .where(eq(schema.missions.id, missionId));
  if (
    !mission ||
    !["running", "queued", "needs_approval"].includes(mission.status)
  )
    return;
  const tasks = await db
    .select()
    .from(schema.missionTasks)
    .where(eq(schema.missionTasks.missionId, missionId));
  const deps = await db
    .select()
    .from(schema.taskDependencies)
    .where(
      inArray(
        schema.taskDependencies.taskId,
        tasks.map((t) => t.id),
      ),
    );
  for (const t of readyTasks(tasks, deps)) {
    if (t.taskType === "jordan.export") continue; // only a human approval + export request releases Jordan
    await queueTask(db, t);
  }
}

export async function queueTask(db: DB | Tx, t: MissionTask) {
  await db
    .update(schema.missionTasks)
    .set({ status: "queued" })
    .where(eq(schema.missionTasks.id, t.id));
  await enqueue(
    db as DB,
    "task.run",
    { taskId: t.id },
    {
      orgId: t.organizationId,
      dedupeKey: `task:${t.id}:${t.attempts}:${Date.now()}`,
    },
  );
}

export async function setMissionStatus(
  db: DB | Tx,
  missionId: string,
  to: MissionStatus,
) {
  const [m] = await db
    .select()
    .from(schema.missions)
    .where(eq(schema.missions.id, missionId));
  if (!m || m.status === to || !canMission(m.status, to))
    return m?.status === to;
  const patch: Partial<Mission> = { status: to, updatedAt: new Date() };
  if (to === "running" && !m.startedAt) patch.startedAt = new Date();
  if (["succeeded", "failed", "cancelled"].includes(to))
    patch.completedAt = new Date();
  await db
    .update(schema.missions)
    .set(patch)
    .where(eq(schema.missions.id, missionId));
  return true;
}

async function updateProgress(db: DB | Tx, missionId: string) {
  const rows = await db
    .select({ status: schema.missionTasks.status })
    .from(schema.missionTasks)
    .where(eq(schema.missionTasks.missionId, missionId));
  const live = rows.filter((r) => r.status !== "cancelled");
  const done = live.filter((r) => r.status === "succeeded").length;
  await db
    .update(schema.missions)
    .set({
      progress: live.length ? Math.round((done / live.length) * 100) : 0,
      updatedAt: new Date(),
    })
    .where(eq(schema.missions.id, missionId));
}

// ---------------------------------------------------------------- runner

type HandlerCtx = {
  db: DB;
  mission: Mission;
  task: MissionTask;
  agent: AgentSlug;
};
type Handler = (c: HandlerCtx) => Promise<Record<string, unknown>>;

/** Executes one task. Throws on failure so the queue can retry with backoff. */
export async function runTask(db: DB, taskId: string) {
  const [task] = await db
    .select()
    .from(schema.missionTasks)
    .where(eq(schema.missionTasks.id, taskId));
  if (!task || ["succeeded", "cancelled"].includes(task.status))
    return "skipped";
  const [mission] = await db
    .select()
    .from(schema.missions)
    .where(eq(schema.missions.id, task.missionId));
  if (!mission) return "skipped";
  if (mission.status === "cancelled") {
    await db
      .update(schema.missionTasks)
      .set({ status: "cancelled" })
      .where(eq(schema.missionTasks.id, taskId));
    return "skipped";
  }
  if (mission.status === "paused") {
    // Leave it queued; resume() re-enqueues queued tasks.
    await db
      .update(schema.missionTasks)
      .set({ status: "queued" })
      .where(eq(schema.missionTasks.id, taskId));
    return "deferred";
  }
  if (mission.status === "queued")
    await setMissionStatus(db, mission.id, "running");

  const agent = task.agentSlug as AgentSlug;
  // Atomic claim: only one worker can move a task into "running".
  const claimed = await db
    .update(schema.missionTasks)
    .set({
      status: "running",
      attempts: task.attempts + 1,
      startedAt: new Date(),
      errorClass: null,
      errorMessage: null,
    })
    .where(
      and(
        eq(schema.missionTasks.id, taskId),
        inArray(schema.missionTasks.status, [
          "queued",
          "retrying",
          "pending",
          "failed",
        ]),
      ),
    )
    .returning({ id: schema.missionTasks.id });
  if (!claimed.length) return "skipped";
  await emit(db, {
    orgId: mission.organizationId,
    missionId: mission.id,
    taskId,
    agent,
    type: "status",
    message: `${AGENTS[agent].displayName} started: ${task.title}${task.attempts ? ` (attempt ${task.attempts + 1})` : ""}`,
  });

  pacingMission = mission.id;
  const handler = HANDLERS[task.taskType as TaskType];
  if (!handler)
    throw new AppError("unknown_task", `No handler for ${task.taskType}`);
  try {
    // Seeding replays fixed sample history locally; real missions use the
    // configured orchestrator (e.g. RocketRide).
    const orchestrator = noPace.has(mission.id)
      ? seedOrchestrator
      : providers().orchestrator;
    const { output, externalRunId } = await orchestrator.run(
      {
        taskId,
        missionId: mission.id,
        organizationId: mission.organizationId,
        agentSlug: agent,
        taskType: task.taskType,
        input: task.input,
        idempotencyKey: task.idempotencyKey,
      },
      () => handler({ db, mission, task, agent }),
    );
    await db
      .update(schema.missionTasks)
      .set({ status: "succeeded", output, finishedAt: new Date() })
      .where(eq(schema.missionTasks.id, taskId));
    if (externalRunId)
      await db
        .update(schema.missions)
        .set({ externalRunId, orchestrator: orchestrator.id })
        .where(eq(schema.missions.id, mission.id));
    await updateProgress(db, mission.id);
    await scheduleReady(db, mission.id);
    return "succeeded";
  } catch (err) {
    const cls = classifyError(err);
    const message = (err instanceof Error ? err.message : String(err)).slice(
      0,
      400,
    );
    const willRetry =
      cls === "transient" && task.attempts + 1 < task.maxAttempts;
    await db
      .update(schema.missionTasks)
      .set({
        status: willRetry ? "retrying" : "failed",
        errorClass: cls,
        errorMessage: message,
        finishedAt: willRetry ? null : new Date(),
      })
      .where(eq(schema.missionTasks.id, taskId));
    await emit(db, {
      orgId: mission.organizationId,
      missionId: mission.id,
      taskId,
      agent,
      type: "error",
      message: willRetry
        ? `${AGENTS[agent].displayName} hit a temporary problem and will retry: ${message}`
        : `${AGENTS[agent].displayName} could not finish "${task.title}": ${message}. Needs human review.`,
    });
    if (!willRetry) await setMissionStatus(db, mission.id, "blocked");
    log.warn("task.failed", {
      taskId,
      missionId: mission.id,
      errorClass: cls,
      willRetry,
    });
    throw Object.assign(err instanceof Error ? err : new Error(message), {
      retryable: willRetry,
    });
  }
}

// ---------------------------------------------------------------- handlers

async function evidenceMap(
  db: DB | Tx,
  missionId: string,
): Promise<Map<string, EvidenceInfo>> {
  const rows = await db
    .select()
    .from(schema.evidenceSources)
    .where(eq(schema.evidenceSources.missionId, missionId));
  return new Map(
    rows.map((e) => [
      e.id,
      {
        excerpt: e.excerpt,
        leadId: e.leadId,
        url: e.url,
        injectionSuspected: e.injectionSuspected,
      },
    ]),
  );
}

async function workspaceSender(db: DB, orgId: string) {
  const [p] = await db
    .select()
    .from(schema.workspaceProfiles)
    .where(eq(schema.workspaceProfiles.organizationId, orgId));
  const [owner] = await db
    .select({ name: schema.users.name })
    .from(schema.organizationMemberships)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.organizationMemberships.userId),
    )
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, orgId),
        eq(schema.organizationMemberships.role, "owner"),
      ),
    )
    .limit(1);
  return {
    tone: p?.tone ?? "professional, concise",
    sender: `${owner?.name ?? "The team"}${p ? `, ${p.companyName}` : ""}`,
  };
}

const HANDLERS: Record<TaskType, Handler> = {
  "alex.plan": async ({ db, mission, task }) => {
    assertAgentMay("alex", "tasks.plan");
    await pace();
    const assumptions = [
      `Target count: ${mission.requestedCount} leads`,
      `Geography: ${mission.geography}`,
      mission.exclusions.length
        ? `Exclusions enforced: ${mission.exclusions.join("; ")}`
        : "No exclusions provided",
      "Public business information only; no personal contact data",
      "Drafts are prepared, never sent; exports wait for your approval",
    ];
    for (const [to, what] of [
      ["maya", "research the segment and return cited criteria"],
      [
        "leo",
        "find, de-duplicate and score candidates against Maya's criteria",
      ],
      ["sophia", "draft evidence-linked outreach for qualified leads"],
      ["sam", "review evidence, claims and policy before anything reaches you"],
      ["jordan", "prepare approved records for n8n once you approve"],
    ] as const) {
      await emit(db, {
        orgId: mission.organizationId,
        missionId: mission.id,
        taskId: task.id,
        agent: "alex",
        to,
        type: "assignment",
        message: `Alex assigned ${AGENTS[to].displayName}: ${what}`,
      });
    }
    await emit(db, {
      orgId: mission.organizationId,
      missionId: mission.id,
      taskId: task.id,
      agent: "alex",
      type: "artifact",
      message:
        "Plan ready — no blocking questions; using your mission defaults",
      data: { assumptions },
    });
    return { assumptions, blockingQuestions: [] };
  },

  "maya.research": async ({ db, mission, task }) => {
    assertAgentMay("maya", "research.read");
    const research = await providers().research.researchSegment({
      icp: mission.icp,
      geography: mission.geography,
      productContext: mission.productContext,
    });
    await pace();
    const ids = research.sources.map(() => crypto.randomUUID());
    await db.transaction(async (tx) => {
      if (research.sources.length)
        await tx.insert(schema.evidenceSources).values(
          research.sources.map((s, i) => ({
            id: ids[i],
            organizationId: mission.organizationId,
            missionId: mission.id,
            url: s.url,
            title: s.title,
            excerpt: s.excerpt,
            retrievedAt: s.retrievedAt,
            confidence: s.confidence,
            contentHash: s.contentHash,
            provider: providers().research.id,
            isSample: Boolean(s.isSample),
            injectionSuspected: Boolean(s.injectionSuspected),
          })),
        );
    });
    const criteria = research.criteria.map((c) => ({
      ...c,
      evidenceIds: c.sourceIndexes.map((i) => ids[i]),
    }));
    await emit(db, {
      orgId: mission.organizationId,
      missionId: mission.id,
      taskId: task.id,
      agent: "maya",
      to: "leo",
      type: "handoff",
      message: `Maya shared ${criteria.length} criteria backed by ${ids.length} sources; ${research.unknowns.length} unknowns flagged`,
      data: {
        criteria: criteria.map((c) => ({
          criterion: c.criterion,
          detail: c.detail,
          sources: c.evidenceIds.length,
        })),
        unknowns: research.unknowns,
      },
    });
    return { criteria, unknowns: research.unknowns, sourceCount: ids.length };
  },

  "leo.qualify": async ({ db, mission, task }) => {
    assertAgentMay("leo", "leads.write");
    const seedDomains = mission.seedDomains;
    const candidates = await providers().research.findCandidates({
      icp: mission.icp,
      geography: mission.geography,
      exclusions: mission.exclusions,
      count: mission.requestedCount,
      seed: noPace.has(mission.id)
        ? "sample"
        : mission.isSample && mission.title.includes("(live run)")
          ? "sample-live"
          : mission.id,
      seedDomains,
    } as never);
    await pace();
    const existing = await db
      .select({ id: schema.leads.id, key: schema.leads.dedupeKey })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.organizationId, mission.organizationId),
          ne(schema.leads.status, "duplicate"),
        ),
      );
    const existingByKey = new Map(existing.map((e) => [e.key, e.id]));
    const { unique, duplicates } = partitionDuplicates(
      candidates,
      new Set(existingByKey.keys()),
    );

    const counts = {
      qualified: 0,
      needs_review: 0,
      rejected: 0,
      duplicate: duplicates.length,
    };
    const scores: number[] = [];
    await db.transaction(async (tx) => {
      const firstInBatch = new Map<string, string>();
      for (const c of unique) {
        const leadId = crypto.randomUUID();
        const evIds = c.sources.map(() => crypto.randomUUID());
        const s = scoreCandidate(c, evIds, mission.exclusions);
        const injected = c.sources.some((x) => x.injectionSuspected);
        const status =
          injected && s.status !== "rejected" ? "needs_review" : s.status;
        counts[status]++;
        scores.push(s.score);
        const facts: LeadFact[] = c.signals
          .filter((sig) => sig.key !== "exclusion" || s.excludedBy)
          .map((sig) => ({
            claim: sig.claim,
            kind: sig.kind,
            evidenceIds: evIds[sig.sourceIndex] ? [evIds[sig.sourceIndex]] : [],
            key: sig.key,
          }));
        const key = dedupeKey(c.name, c.domain);
        firstInBatch.set(key, leadId);
        await tx.insert(schema.leads).values({
          id: leadId,
          organizationId: mission.organizationId,
          missionId: mission.id,
          companyName: c.name,
          domain: c.domain,
          dedupeKey: key,
          score: s.score,
          scoreBreakdown: s.breakdown,
          rationale: injected
            ? `${s.rationale} Source contained instruction-like text — routed to human review.`
            : s.rationale,
          status,
          confidence: s.confidence,
          facts,
          segment: c.segmentLabel,
          location: c.location,
          employeeRange: c.employeeRange,
          isSample: Boolean(c.isSample),
        });
        if (c.sources.length)
          await tx.insert(schema.evidenceSources).values(
            c.sources.map((src, i) => ({
              id: evIds[i],
              organizationId: mission.organizationId,
              missionId: mission.id,
              leadId,
              url: src.url,
              title: src.title,
              excerpt: src.excerpt,
              retrievedAt: src.retrievedAt,
              confidence: src.confidence,
              contentHash: src.contentHash,
              provider: providers().research.id,
              isSample: Boolean(src.isSample),
              injectionSuspected: Boolean(src.injectionSuspected),
            })),
          );
      }
      for (const d of duplicates) {
        await tx.insert(schema.leads).values({
          organizationId: mission.organizationId,
          missionId: mission.id,
          companyName: d.item.name,
          domain: d.item.domain,
          dedupeKey: d.key,
          duplicateOfLeadId:
            existingByKey.get(d.key) ?? firstInBatch.get(d.key) ?? null,
          score: 0,
          scoreBreakdown: [],
          rationale:
            d.reason === "existing"
              ? "Already in your pipeline from an earlier mission — skipped."
              : "Duplicate of another candidate in this batch — skipped.",
          status: "duplicate",
          confidence: 0,
          isSample: Boolean(d.item.isSample),
        });
      }
    });

    let distribution: unknown = null;
    try {
      assertAgentMay("leo", "sandbox.run_reviewed");
      distribution = (
        await providers().sandbox.runReviewed("score-stats", { scores })
      ).output;
    } catch (e) {
      distribution = {
        unavailable: e instanceof Error ? e.message : "sandbox unavailable",
      };
    }
    await recordUsage(
      db,
      mission.organizationId,
      "lead_researched",
      unique.length,
    );
    await emit(db, {
      orgId: mission.organizationId,
      missionId: mission.id,
      taskId: task.id,
      agent: "leo",
      to: "sophia",
      type: "handoff",
      message: `Leo qualified ${counts.qualified}, flagged ${counts.needs_review} for review, rejected ${counts.rejected}, skipped ${counts.duplicate} duplicates`,
      data: { counts, scoreDistribution: distribution },
    });
    return { counts, scoreDistribution: distribution };
  },

  "sophia.draft": async ({ db, mission, task }) => {
    assertAgentMay("sophia", "drafts.write");
    const leads = await db
      .select()
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.missionId, mission.id),
          inArray(schema.leads.status, ["qualified", "needs_review"]),
        ),
      );
    const { tone, sender } = await workspaceSender(db, mission.organizationId);
    const writer = providers().drafts;
    const drafts: {
      lead: (typeof leads)[number];
      personalizations: ReturnType<typeof choosePersonalizations>;
      subject: string;
      body: string;
    }[] = [];
    for (const lead of leads) {
      const personalizations = choosePersonalizations(lead.facts);
      const { subject, body } = await writer.write({
        company: lead.companyName,
        productContext: mission.productContext,
        tone,
        facts: personalizations.map((p) => ({ text: p.text, kind: p.kind })),
        senderName: sender,
      });
      drafts.push({ lead, personalizations, subject, body });
    }
    await pace();
    await db.transaction(async (tx) => {
      for (const d of drafts) {
        const id = crypto.randomUUID();
        await tx.insert(schema.outreachDrafts).values({
          id,
          organizationId: mission.organizationId,
          missionId: mission.id,
          leadId: d.lead.id,
          version: 1,
          subject: d.subject,
          body: d.body,
          personalizations: d.personalizations,
          status: "draft",
          authorAgent: "sophia",
          generator: writer.id,
        });
        await tx
          .update(schema.leads)
          .set({ currentDraftId: id })
          .where(eq(schema.leads.id, d.lead.id));
      }
    });
    await emit(db, {
      orgId: mission.organizationId,
      missionId: mission.id,
      taskId: task.id,
      agent: "sophia",
      to: "sam",
      type: "handoff",
      message: `Sophia drafted ${drafts.length} messages, each personalisation linked to a source`,
      data: { drafts: drafts.length, generator: writer.id },
    });
    return { drafted: drafts.length };
  },

  "sam.review": async (c) => samReview(c, 1),
  "sam.recheck": async (c) => samReview(c, 2),

  "sophia.revise": async ({ db, mission, task }) => {
    assertAgentMay("sophia", "drafts.write");
    const leadIds = (task.input.leadIds as string[]) ?? [];
    const { tone, sender } = await workspaceSender(db, mission.organizationId);
    let revised = 0;
    for (const leadId of leadIds) {
      const [lead] = await db
        .select()
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.id, leadId),
            eq(schema.leads.missionId, mission.id),
          ),
        );
      if (!lead?.currentDraftId) continue;
      const [draft] = await db
        .select()
        .from(schema.outreachDrafts)
        .where(eq(schema.outreachDrafts.id, lead.currentDraftId));
      const [finding] = await db
        .select()
        .from(schema.reviewFindings)
        .where(eq(schema.reviewFindings.draftId, draft.id))
        .orderBy(sql`${schema.reviewFindings.createdAt} desc`)
        .limit(1);
      const drop = (finding?.findings ?? [])
        .filter((f: Finding) => f.code === "unsupported_claim" && f.ref)
        .map((f: Finding) => f.ref!);
      const personalizations = draft.personalizations.filter(
        (p) => !drop.includes(p.text),
      );
      const out = await providers().drafts.write({
        company: lead.companyName,
        productContext: mission.productContext,
        tone,
        facts: personalizations.map((p) => ({ text: p.text, kind: p.kind })),
        senderName: sender,
      });
      await db.transaction(async (tx) => {
        const id = crypto.randomUUID();
        await tx
          .update(schema.outreachDrafts)
          .set({ status: "superseded" })
          .where(eq(schema.outreachDrafts.id, draft.id));
        await tx.insert(schema.outreachDrafts).values({
          id,
          organizationId: mission.organizationId,
          missionId: mission.id,
          leadId,
          version: draft.version + 1,
          subject: out.subject,
          body: out.body,
          personalizations,
          status: "draft",
          revisionOfId: draft.id,
          authorAgent: "sophia",
          generator: providers().drafts.id,
        });
        await tx
          .update(schema.leads)
          .set({ currentDraftId: id })
          .where(eq(schema.leads.id, leadId));
      });
      revised++;
      await emit(db, {
        orgId: mission.organizationId,
        missionId: mission.id,
        taskId: task.id,
        agent: "sophia",
        to: "sam",
        type: "handoff",
        message: `Sophia revised the ${lead.companyName} draft (v${draft.version + 1}), removing ${drop.length} unsupported claim${drop.length === 1 ? "" : "s"}`,
        data: { leadId, removed: drop },
      });
    }
    await pace();
    return { revised };
  },

  "alex.request_approvals": async ({ db, mission, task }) => {
    assertAgentMay("alex", "approvals.request");
    await pace();
    const created = await openApprovalRequests(db, mission.id);
    await setMissionStatus(db, mission.id, "needs_approval");
    await db
      .update(schema.missionTasks)
      .set({ status: "needs_approval" })
      .where(
        and(
          eq(schema.missionTasks.missionId, mission.id),
          eq(schema.missionTasks.taskType, "jordan.export"),
          eq(schema.missionTasks.status, "pending"),
        ),
      );
    await emit(db, {
      orgId: mission.organizationId,
      missionId: mission.id,
      taskId: task.id,
      agent: "alex",
      type: "approval",
      message: `Alex requested your approval for ${created} lead${created === 1 ? "" : "s"}. Nothing leaves MissionControl until you approve.`,
      data: { approvals: created },
    });
    return { approvalsRequested: created };
  },

  "jordan.export": async ({ db, mission, task }) => {
    assertAgentMay("jordan", "export.n8n_after_approval");
    const result = await processDeliveries(db, mission.id, task.id);
    await pace();
    if (result.retryable > 0)
      throw new AppError(
        "delivery_retry",
        `${result.retryable} deliveries failed temporarily`,
        503,
        "transient",
      );
    return result;
  },

  "alex.summarize": async ({ db, mission, task }) => {
    await pace();
    const leads = await db
      .select({ status: schema.leads.status })
      .from(schema.leads)
      .where(eq(schema.leads.missionId, mission.id));
    const count = (s: string) => leads.filter((l) => l.status === s).length;
    const deliveries = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.missionId, mission.id));
    const pending = await db
      .select({ id: schema.approvalRequests.id })
      .from(schema.approvalRequests)
      .where(
        and(
          eq(schema.approvalRequests.missionId, mission.id),
          eq(schema.approvalRequests.status, "pending"),
        ),
      );
    const sources = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.evidenceSources)
      .where(eq(schema.evidenceSources.missionId, mission.id));
    const summary = {
      researched: leads.length,
      qualified: count("qualified") + count("approved") + count("exported"),
      needsReview: count("needs_review"),
      rejected: count("rejected"),
      duplicates: count("duplicate"),
      exported: deliveries.filter((d) => d.state === "delivered").length,
      exportMode: deliveries[0]?.mode ?? null,
      exportedLive: deliveries.filter(
        (d) => d.state === "delivered" && d.mode === "live",
      ).length,
      exportedMock: deliveries.filter(
        (d) => d.state === "delivered" && d.mode === "mock",
      ).length,
      pendingApprovals: pending.length,
      sources: sources[0]?.c ?? 0,
    };
    await db
      .update(schema.missions)
      .set({ summary: { ...(mission.summary ?? {}), result: summary } })
      .where(eq(schema.missions.id, mission.id));
    await emit(db, {
      orgId: mission.organizationId,
      missionId: mission.id,
      taskId: task.id,
      agent: "alex",
      type: "summary",
      message: `Alex: ${[summary.exportedLive ? `${summary.exportedLive} approved record${summary.exportedLive === 1 ? "" : "s"} delivered to n8n` : "", summary.exportedMock ? `${summary.exportedMock} recorded by the mock connection (not sent)` : ""].filter(Boolean).join(", ") || "nothing exported yet"}; ${summary.needsReview} need review; ${summary.pendingApprovals} still awaiting approval.`,
      data: summary,
    });
    await setMissionStatus(
      db,
      mission.id,
      summary.pendingApprovals ? "needs_approval" : "succeeded",
    );
    return summary;
  },
};

async function samReview({ db, mission, task }: HandlerCtx, round: number) {
  assertAgentMay("sam", "review.write");
  const onlyLeads = (task.input.leadIds as string[] | undefined) ?? null;
  const leads = await db
    .select()
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.missionId, mission.id),
        inArray(schema.leads.status, ["qualified", "needs_review"]),
      ),
    );
  const ev = await evidenceMap(db, mission.id);
  const toRevise: string[] = [];
  const tally = { pass: 0, revise: 0, block: 0 };
  await pace();
  await db.transaction(async (tx) => {
    for (const lead of leads) {
      if (onlyLeads && !onlyLeads.includes(lead.id)) continue;
      if (!lead.currentDraftId) continue;
      const [draft] = await tx
        .select()
        .from(schema.outreachDrafts)
        .where(eq(schema.outreachDrafts.id, lead.currentDraftId));
      const findings = [
        ...reviewLead(lead, ev),
        ...reviewDraft(draft, lead.id, ev),
      ];
      let verdict = verdictFor(findings);
      // Second round: anything still failing goes to a human, not back to Sophia.
      if (round > 1 && verdict === "revise") verdict = "block";
      tally[verdict]++;
      await tx.insert(schema.reviewFindings).values({
        organizationId: mission.organizationId,
        missionId: mission.id,
        leadId: lead.id,
        draftId: draft.id,
        round,
        verdict,
        findings,
      });
      await tx
        .update(schema.outreachDrafts)
        .set({ status: verdict === "pass" ? "ready" : "needs_revision" })
        .where(eq(schema.outreachDrafts.id, draft.id));
      if (verdict === "block")
        await tx
          .update(schema.leads)
          .set({ status: "needs_review", updatedAt: new Date() })
          .where(eq(schema.leads.id, lead.id));
      if (verdict === "revise") toRevise.push(lead.id);
      if (verdict !== "pass")
        await emit(tx as unknown as DB, {
          orgId: mission.organizationId,
          missionId: mission.id,
          taskId: task.id,
          agent: "sam",
          to: verdict === "revise" ? "sophia" : null,
          type: "review",
          message:
            verdict === "revise"
              ? `Sam sent ${lead.companyName} back to Sophia: ${findings.find((f) => f.severity === "error")?.message}`
              : `Sam blocked ${lead.companyName} for human review: ${findings.find((f) => f.severity === "error")?.message ?? "unresolved issue"}`,
          data: {
            leadId: lead.id,
            verdict,
            codes: findings.map((f) => f.code),
          },
        });
    }
    if (toRevise.length) {
      // Insert revise → recheck between this review and the approval request.
      const [approvalTask] = await tx
        .select()
        .from(schema.missionTasks)
        .where(
          and(
            eq(schema.missionTasks.missionId, mission.id),
            eq(schema.missionTasks.taskType, "alex.request_approvals"),
            eq(schema.missionTasks.status, "pending"),
          ),
        );
      const revise = await addTask(tx, mission, {
        type: "sophia.revise",
        agent: "sophia",
        title: `Revise ${toRevise.length} draft${toRevise.length === 1 ? "" : "s"} flagged by Sam`,
        deps: [task.id],
        input: { leadIds: toRevise },
        position: task.position + 2,
      });
      const recheck = await addTask(tx, mission, {
        type: "sam.recheck",
        agent: "sam",
        title: "Re-review revised drafts",
        deps: [revise],
        input: { leadIds: toRevise },
        position: task.position + 4,
      });
      if (approvalTask)
        await tx.insert(schema.taskDependencies).values({
          organizationId: mission.organizationId,
          taskId: approvalTask.id,
          dependsOnTaskId: recheck,
        });
    }
  });
  await emit(db, {
    orgId: mission.organizationId,
    missionId: mission.id,
    taskId: task.id,
    agent: "sam",
    to: "alex",
    type: "review",
    message: `Sam's review (round ${round}): ${tally.pass} pass, ${tally.revise} revise, ${tally.block} blocked for human review`,
    data: tally,
  });
  return { round, ...tally, sentBack: toRevise.length };
}

// ---------------------------------------------------------------- approvals & export

/** Creates a pending approval for every reviewable lead lacking a current one. */
export async function openApprovalRequests(db: DB | Tx, missionId: string) {
  const leads = await db
    .select()
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.missionId, missionId),
        inArray(schema.leads.status, ["qualified", "needs_review"]),
      ),
    );
  let created = 0;
  for (const lead of leads) {
    if (!lead.currentDraftId) continue;
    const created1 = await openApprovalForLead(db, lead.id);
    if (created1) created++;
  }
  return created;
}

export async function currentPayload(db: DB | Tx, leadId: string) {
  const [lead] = await db
    .select()
    .from(schema.leads)
    .where(eq(schema.leads.id, leadId));
  if (!lead) return null;
  const [draft] = lead.currentDraftId
    ? await db
        .select()
        .from(schema.outreachDrafts)
        .where(eq(schema.outreachDrafts.id, lead.currentDraftId))
    : [null];
  const ev = await db
    .select({
      url: schema.evidenceSources.url,
      title: schema.evidenceSources.title,
    })
    .from(schema.evidenceSources)
    .where(eq(schema.evidenceSources.leadId, leadId));
  const payload = buildApprovalPayload(lead, draft ?? null, ev);
  return {
    lead,
    draft: draft ?? null,
    payload,
    hash: hashApprovalPayload(payload),
  };
}

/** Supersedes stale approvals and opens one for the lead's current payload. Returns true when a new request was opened. */
export async function openApprovalForLead(db: DB | Tx, leadId: string) {
  const cur = await currentPayload(db, leadId);
  if (!cur) return false;
  const open = await db
    .select()
    .from(schema.approvalRequests)
    .where(
      and(
        eq(schema.approvalRequests.leadId, leadId),
        inArray(schema.approvalRequests.status, ["pending", "approved"]),
      ),
    );
  if (open.some((a) => a.payloadHash === cur.hash)) return false;
  for (const a of open)
    await db
      .update(schema.approvalRequests)
      .set({ status: "superseded" })
      .where(eq(schema.approvalRequests.id, a.id));
  const versions = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.approvalRequests)
    .where(eq(schema.approvalRequests.leadId, leadId));
  await db.insert(schema.approvalRequests).values({
    organizationId: cur.lead.organizationId,
    missionId: cur.lead.missionId,
    leadId,
    destination: EXPORT_DESTINATION,
    payload: cur.payload as unknown as Record<string, unknown>,
    payloadHash: cur.hash,
    payloadVersion: (versions[0]?.c ?? 0) + 1,
    status: "pending",
  });
  return true;
}

/**
 * Jordan's delivery loop over the transactional outbox. Every delivery is
 * re-validated against the *current* payload hash right before sending, so an
 * edit made after approval stops the send. Idempotency keys make retries safe.
 */
export async function processDeliveries(
  db: DB,
  missionId: string,
  taskId: string | null,
) {
  const [mission] = await db
    .select()
    .from(schema.missions)
    .where(eq(schema.missions.id, missionId));
  const rows = await db
    .select()
    .from(schema.webhookDeliveries)
    .where(
      and(
        eq(schema.webhookDeliveries.missionId, missionId),
        inArray(schema.webhookDeliveries.state, ["pending", "failed"]),
      ),
    );
  const { resolveLeadSink } = await import("@/server/services/integrations");
  const liveSink = await resolveLeadSink(db, mission.organizationId);
  const { MockLeadSink } = await import("@/integrations/n8n");
  const mockSink = new MockLeadSink();
  // Each delivery keeps the mode chosen when it was queued: a "mock" row is
  // never upgraded to a live send just because live exports were enabled later.
  const sinkFor = (mode: string) => (mode === "mock" ? mockSink : liveSink);
  const sink = liveSink;
  const result = {
    delivered: 0,
    skipped: 0,
    retryable: 0,
    dead: 0,
    mode:
      rows.length && rows.every((r) => r.mode === "mock")
        ? "mock"
        : sink.mode === "demo"
          ? "mock"
          : "live",
  };
  for (const d of rows) {
    const [approval] = await db
      .select()
      .from(schema.approvalRequests)
      .where(eq(schema.approvalRequests.id, d.approvalRequestId));
    const cur = await currentPayload(db, approval.leadId);
    const check = cur
      ? checkExportable(approval, cur.hash)
      : ({
          ok: false,
          reason: "not_approved",
          message: "Lead missing",
        } as const);
    if (!check.ok || !cur) {
      await db
        .update(schema.webhookDeliveries)
        .set({ state: "dead", lastError: check.ok ? "missing" : check.message })
        .where(eq(schema.webhookDeliveries.id, d.id));
      result.skipped++;
      continue;
    }
    if (mission.mode === "live" && sink.mode === "demo")
      throw new AppError(
        "mock_in_live",
        "Live mission cannot export through a mock connection",
        409,
      );
    const [decision] = await db
      .select()
      .from(schema.approvalDecisions)
      .where(
        and(
          eq(schema.approvalDecisions.approvalRequestId, approval.id),
          eq(schema.approvalDecisions.decision, "approve"),
        ),
      )
      .limit(1);
    const [approver] = decision
      ? await db
          .select({ email: schema.users.email, name: schema.users.name })
          .from(schema.users)
          .where(eq(schema.users.id, decision.decidedBy))
      : [];
    const payload: LeadExportPayload = {
      schemaVersion: 1,
      approvalId: approval.id,
      approvalPayloadHash: approval.payloadHash,
      missionId,
      idempotencyKey: d.idempotencyKey,
      lead: {
        company: cur.lead.companyName,
        domain: cur.lead.domain,
        score: cur.lead.score,
        rationale: cur.lead.rationale,
        location: cur.lead.location,
        sources: cur.payload.sources,
      },
      draft: cur.draft
        ? {
            subject: cur.draft.subject,
            body: cur.draft.body,
            version: cur.draft.version,
          }
        : null,
      approvedBy: approver?.name ?? "unknown",
      approvedAt: (decision?.createdAt ?? new Date()).toISOString(),
    };
    await db
      .update(schema.webhookDeliveries)
      .set({ state: "delivering", attempts: d.attempts + 1 })
      .where(eq(schema.webhookDeliveries.id, d.id));
    const r = await sinkFor(d.mode).deliver(payload);
    if (r.ok) {
      await db
        .update(schema.webhookDeliveries)
        .set({
          state: "delivered",
          mode: r.mode,
          deliveredAt: new Date(),
          responseSummary: r.summary,
          externalRef: r.externalRef,
          lastError: null,
        })
        .where(eq(schema.webhookDeliveries.id, d.id));
      await db
        .update(schema.leads)
        .set({
          status: "exported",
          stage: r.mode === "mock" ? "exported (mock)" : "in pipeline",
          updatedAt: new Date(),
        })
        .where(eq(schema.leads.id, cur.lead.id));
      await audit(db, {
        orgId: mission.organizationId,
        actorType: "agent",
        actorId: "jordan",
        action: r.mode === "mock" ? "export.mock" : "export.external_write",
        targetType: "lead",
        targetId: cur.lead.id,
        metadata: { deliveryId: d.id, mode: r.mode },
      });
      await recordUsage(db, mission.organizationId, "export", 1);
      result.delivered++;
    } else {
      const dead = !r.retryable || d.attempts + 1 >= 5;
      await db
        .update(schema.webhookDeliveries)
        .set({
          state: dead ? "dead" : "failed",
          lastError: r.summary,
          nextAttemptAt: new Date(Date.now() + 30_000),
        })
        .where(eq(schema.webhookDeliveries.id, d.id));
      if (dead) result.dead++;
      else result.retryable++;
    }
  }
  if (mission)
    await emit(db, {
      orgId: mission.organizationId,
      missionId,
      taskId,
      agent: "jordan",
      to: "alex",
      type: "export",
      message:
        result.mode === "mock"
          ? `Jordan recorded ${result.delivered} approved record${result.delivered === 1 ? "" : "s"} with the MOCK n8n connection (demo — nothing was sent)${result.skipped ? `; ${result.skipped} skipped as stale` : ""}`
          : `Jordan delivered ${result.delivered} approved record${result.delivered === 1 ? "" : "s"} to n8n; ${result.retryable} will retry, ${result.dead} failed permanently${result.skipped ? `, ${result.skipped} skipped as stale` : ""}`,
      data: result,
    });
  return result;
}
