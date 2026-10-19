import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { schema, type DB } from "@/db/client";
import type { AuthContext } from "@/server/auth";
import { emit } from "@/server/events";
import { audit, currentPeriod, recordUsage, track } from "@/server/audit";
import { AppError, conflict, notFound } from "@/shared/errors";
import { env } from "@/shared/env";
import type { MissionInput } from "@/shared/schemas";
import { canMission } from "@/features/state-machine";
import {
  createTaskGraph,
  queueTask,
  scheduleReady,
  setMissionStatus,
} from "@/workers/engine";
import { providers } from "@/integrations";

/**
 * Mission lifecycle. Every query is scoped by `auth.orgId`; a mission id from
 * another organization behaves exactly like a missing one (404), so ids
 * cannot be probed across tenants.
 */
export async function getOwnedMission(
  db: DB,
  orgId: string,
  missionId: string,
) {
  if (!/^[0-9a-f-]{36}$/i.test(missionId)) throw notFound("Mission");
  const [m] = await db
    .select()
    .from(schema.missions)
    .where(
      and(
        eq(schema.missions.id, missionId),
        eq(schema.missions.organizationId, orgId),
      ),
    );
  if (!m) throw notFound("Mission");
  return m;
}

export async function createMission(
  db: DB,
  auth: AuthContext,
  input: MissionInput,
) {
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, auth.orgId));
  const used = await db
    .select({
      n: sql<number>`coalesce(sum(${schema.usageRecords.quantity}), 0)::int`,
    })
    .from(schema.usageRecords)
    .where(
      and(
        eq(schema.usageRecords.organizationId, auth.orgId),
        eq(schema.usageRecords.metric, "mission_started"),
        eq(schema.usageRecords.period, currentPeriod()),
      ),
    );
  if ((used[0]?.n ?? 0) >= org.monthlyMissionLimit)
    throw new AppError(
      "usage_limit",
      `Monthly mission limit (${org.monthlyMissionLimit}) reached`,
      402,
    );

  // Live mode only when every external path is live; otherwise the mission is
  // labelled demo end-to-end.
  const p = providers();
  const mode = !env().DEMO_MODE && p.research.mode === "live" ? "live" : "demo";
  const [m] = await db
    .insert(schema.missions)
    .values({
      organizationId: auth.orgId,
      createdBy: auth.userId,
      title: input.title ?? input.goal.slice(0, 80),
      goal: input.goal,
      productContext: input.productContext,
      icp: input.icp,
      geography: input.geography,
      exclusions: input.exclusions,
      deliverables: input.deliverables,
      dataConstraints: input.dataConstraints,
      requestedCount: input.requestedCount,
      seedDomains: input.seedDomains,
      mode,
      orchestrator: p.orchestrator.id,
      isSample: auth.orgIsDemo,
    })
    .returning();
  await audit(db, {
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "mission.create",
    targetType: "mission",
    targetId: m.id,
  });
  await track(db, auth.orgId, "mission_created", {
    requestedCount: input.requestedCount,
    mode,
  });
  if (input.autoStart) await startMission(db, auth, m.id);
  return m;
}

export async function listMissions(db: DB, orgId: string) {
  return db
    .select()
    .from(schema.missions)
    .where(eq(schema.missions.organizationId, orgId))
    .orderBy(desc(schema.missions.createdAt))
    .limit(50);
}

export async function missionDetail(db: DB, orgId: string, missionId: string) {
  const mission = await getOwnedMission(db, orgId, missionId);
  const tasks = await db
    .select()
    .from(schema.missionTasks)
    .where(eq(schema.missionTasks.missionId, missionId))
    .orderBy(
      asc(schema.missionTasks.position),
      asc(schema.missionTasks.createdAt),
    );
  const deps = tasks.length
    ? await db
        .select()
        .from(schema.taskDependencies)
        .where(
          inArray(
            schema.taskDependencies.taskId,
            tasks.map((t) => t.id),
          ),
        )
    : [];
  const counts = await db
    .select({ status: schema.leads.status, n: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(eq(schema.leads.missionId, missionId))
    .groupBy(schema.leads.status);
  const pendingApprovals = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.approvalRequests)
    .where(
      and(
        eq(schema.approvalRequests.missionId, missionId),
        eq(schema.approvalRequests.status, "pending"),
      ),
    );
  return {
    mission,
    tasks,
    deps,
    leadCounts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    pendingApprovals: pendingApprovals[0]?.n ?? 0,
  };
}

export async function startMission(
  db: DB,
  auth: AuthContext,
  missionId: string,
) {
  const m = await getOwnedMission(db, auth.orgId, missionId);
  if (m.status !== "draft") return m; // idempotent
  await createTaskGraph(db, m);
  await setMissionStatus(db, m.id, "queued");
  await recordUsage(db, auth.orgId, "mission_started");
  await track(db, auth.orgId, "mission_started", {});
  await emit(db, {
    orgId: auth.orgId,
    missionId,
    type: "human",
    message: `${auth.userName} started the mission`,
  });
  await scheduleReady(db, missionId);
  return getOwnedMission(db, auth.orgId, missionId);
}

export async function pauseMission(
  db: DB,
  auth: AuthContext,
  missionId: string,
) {
  const m = await getOwnedMission(db, auth.orgId, missionId);
  if (m.status === "paused") return m;
  if (!canMission(m.status, "paused"))
    throw conflict("invalid_transition", `Cannot pause a ${m.status} mission`);
  await setMissionStatus(db, missionId, "paused");
  await emit(db, {
    orgId: auth.orgId,
    missionId,
    type: "human",
    message: `${auth.userName} paused the mission; running steps finish, nothing new starts`,
  });
  await audit(db, {
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "mission.pause",
    targetType: "mission",
    targetId: missionId,
  });
  return getOwnedMission(db, auth.orgId, missionId);
}

export async function resumeMission(
  db: DB,
  auth: AuthContext,
  missionId: string,
) {
  const m = await getOwnedMission(db, auth.orgId, missionId);
  if (m.status === "running") return m;
  if (!["paused", "blocked"].includes(m.status))
    throw conflict("invalid_transition", `Cannot resume a ${m.status} mission`);
  await setMissionStatus(db, missionId, "running");
  // Re-queue anything that was waiting (paused) or failed (blocked → human chose to retry).
  const stuck = await db
    .select()
    .from(schema.missionTasks)
    .where(
      and(
        eq(schema.missionTasks.missionId, missionId),
        inArray(schema.missionTasks.status, ["queued", "failed", "retrying"]),
      ),
    );
  for (const t of stuck) await queueTask(db, t);
  await emit(db, {
    orgId: auth.orgId,
    missionId,
    type: "human",
    message: `${auth.userName} resumed the mission${stuck.length ? ` (${stuck.length} step${stuck.length === 1 ? "" : "s"} re-queued)` : ""}`,
  });
  await audit(db, {
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "mission.resume",
    targetType: "mission",
    targetId: missionId,
  });
  await scheduleReady(db, missionId);
  return getOwnedMission(db, auth.orgId, missionId);
}

export async function cancelMission(
  db: DB,
  auth: AuthContext,
  missionId: string,
) {
  const m = await getOwnedMission(db, auth.orgId, missionId);
  if (m.status === "cancelled") return m;
  if (!canMission(m.status, "cancelled"))
    throw conflict("invalid_transition", `Cannot cancel a ${m.status} mission`);
  await setMissionStatus(db, missionId, "cancelled");
  await db
    .update(schema.missionTasks)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(
      and(
        eq(schema.missionTasks.missionId, missionId),
        notInArray(schema.missionTasks.status, [
          "succeeded",
          "failed",
          "cancelled",
        ]),
      ),
    );
  await db
    .update(schema.approvalRequests)
    .set({ status: "superseded" })
    .where(
      and(
        eq(schema.approvalRequests.missionId, missionId),
        eq(schema.approvalRequests.status, "pending"),
      ),
    );
  await emit(db, {
    orgId: auth.orgId,
    missionId,
    type: "human",
    message: `${auth.userName} cancelled the mission; open approvals were withdrawn`,
  });
  await audit(db, {
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "mission.cancel",
    targetType: "mission",
    targetId: missionId,
  });
  return getOwnedMission(db, auth.orgId, missionId);
}

export async function missionEvents(
  db: DB,
  orgId: string,
  missionId: string,
  afterSeq = 0,
) {
  await getOwnedMission(db, orgId, missionId);
  return db
    .select()
    .from(schema.agentEvents)
    .where(
      and(
        eq(schema.agentEvents.missionId, missionId),
        eq(schema.agentEvents.organizationId, orgId),
        sql`${schema.agentEvents.seq} > ${afterSeq}`,
      ),
    )
    .orderBy(asc(schema.agentEvents.seq))
    .limit(500);
}
