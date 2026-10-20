import { providers } from "@/integrations";
import { and, eq, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import { schema, type DB } from "./client";
import { AGENTS, AGENT_ORDER } from "@/features/agents/profiles";
import {
  noPace,
  runTask,
  setMissionStatus,
  createTaskGraph,
  scheduleReady,
} from "@/workers/engine";

/**
 * Idempotent demo seed. Everything here is FICTIONAL and labelled as sample
 * data. The completed mission is produced by running the real engine (with
 * pacing off), so its task graph, handoffs, Sam's revision round, approvals
 * and the mock n8n delivery are genuine persisted records, not hand-written
 * fixtures.
 *
 * seedOrganization(db, { slug: "northwind-demo", ... }) twice -> second call is a no-op.
 */
export const SAMPLE_PROFILE = {
  companyName: "Northwind Assist (fictional)",
  productDescription:
    "Northwind Assist is an AI copilot that drafts answers to customer-support tickets from your help center and past replies, so small SaaS teams answer faster without hiring ahead of demand.",
  icp: "B2B SaaS companies with 10–150 employees, a self-serve product, a mainstream help desk, and a small support team handling growing ticket volume",
  geography: "United States, Canada and United Kingdom",
  exclusions: [
    "Regulated healthcare data providers",
    "Companies with more than 500 employees",
    "Existing customers",
  ],
  tone: "Professional, concise, respectful; no hype",
  desiredOutput:
    "Qualified leads with cited evidence, editable outreach drafts, and a validation report",
};

export const PRIMARY_GOAL =
  "Find 20 potential customers for my AI SaaS product. Research their businesses, qualify them against my ideal customer profile, prepare personalized outreach drafts, validate the evidence, and save approved results to my sales pipeline.";

export async function ensureAgentProfiles(db: DB, orgId: string) {
  await db
    .insert(schema.agentProfiles)
    .values(
      AGENT_ORDER.map((slug) => {
        const a = AGENTS[slug];
        return {
          organizationId: orgId,
          slug,
          displayName: a.displayName,
          title: a.title,
          character: a.character,
          responsibility: a.responsibility,
          accentColor: a.accentColor,
          toolPermissions: a.toolPermissions,
          language: a.voice.language,
          avatarProvider: "local",
          voiceProvider: "browser_tts",
        };
      }),
    )
    .onConflictDoNothing();
}

/** Runs a mission's queued tasks inline until nothing is left to do. */
export async function drainMission(db: DB, missionId: string) {
  noPace.add(missionId);
  try {
    for (let i = 0; i < 60; i++) {
      const queued = await db
        .select()
        .from(schema.missionTasks)
        .where(
          and(
            eq(schema.missionTasks.missionId, missionId),
            inArray(schema.missionTasks.status, ["queued", "retrying"]),
          ),
        );
      if (!queued.length) break;
      for (const t of queued) await runTask(db, t.id).catch(() => undefined);
    }
  } finally {
    noPace.delete(missionId);
  }
}

export async function seedOrganization(
  db: DB,
  opts: {
    slug: string;
    orgName: string;
    owner: { email: string; name: string };
    inProgressMission?: boolean;
  },
) {
  const [existing] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, opts.slug));
  if (existing) {
    const [m] = await db
      .select()
      .from(schema.organizationMemberships)
      .where(
        and(
          eq(schema.organizationMemberships.organizationId, existing.id),
          eq(schema.organizationMemberships.role, "owner"),
        ),
      );
    return { orgId: existing.id, userId: m.userId, created: false };
  }
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: opts.orgName, slug: opts.slug, isDemo: true })
    .returning();
  const [user] = await db
    .insert(schema.users)
    .values({
      email: opts.owner.email,
      name: opts.owner.name,
      authProvider: "demo",
    })
    .onConflictDoUpdate({
      target: schema.users.email,
      set: { name: opts.owner.name },
    })
    .returning();
  await db
    .insert(schema.organizationMemberships)
    .values({ organizationId: org.id, userId: user.id, role: "owner" });
  await db
    .insert(schema.workspaceProfiles)
    .values({ organizationId: org.id, ...SAMPLE_PROFILE });
  await ensureAgentProfiles(db, org.id);

  // ---- completed sample mission ------------------------------------------
  const [mission] = await db
    .insert(schema.missions)
    .values({
      organizationId: org.id,
      createdBy: user.id,
      title: "Sample: 20 prospects for Northwind Assist",
      goal: PRIMARY_GOAL,
      productContext: SAMPLE_PROFILE.productDescription,
      icp: SAMPLE_PROFILE.icp,
      geography: SAMPLE_PROFILE.geography,
      exclusions: SAMPLE_PROFILE.exclusions,
      deliverables: [
        "Qualified leads with evidence",
        "Editable outreach drafts",
        "Validation report",
      ],
      dataConstraints:
        "Public business information only. No personal contact details. No messages are sent.",
      requestedCount: 20,
      mode: "demo",
      isSample: true,
    })
    .returning();
  noPace.add(mission.id);
  await createTaskGraph(db, mission);
  await setMissionStatus(db, mission.id, "queued");
  await scheduleReady(db, mission.id);
  await drainMission(db, mission.id);

  // Seeded human decisions: approve the three strongest, reject one, export.
  const pending = await db
    .select({
      a: schema.approvalRequests,
      score: schema.leads.score,
      name: schema.leads.companyName,
    })
    .from(schema.approvalRequests)
    .innerJoin(
      schema.leads,
      eq(schema.leads.id, schema.approvalRequests.leadId),
    )
    .where(
      and(
        eq(schema.approvalRequests.missionId, mission.id),
        eq(schema.approvalRequests.status, "pending"),
      ),
    );
  pending.sort((x, y) => y.score - x.score);
  const auth = {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    orgId: org.id,
    orgName: org.name,
    orgIsDemo: true,
    role: "owner" as const,
  };
  const { decideApproval, requestExport } =
    await import("@/server/services/leads");
  for (const p of pending.slice(0, 3))
    await decideApproval(db, auth, p.a.id, {
      decision: "approve",
      payloadHash: p.a.payloadHash,
      reason: "Seeded sample decision",
    });
  const weakest = pending[pending.length - 1];
  if (weakest && pending.length > 4)
    await decideApproval(db, auth, weakest.a.id, {
      decision: "reject",
      payloadHash: weakest.a.payloadHash,
      reason: "Seeded sample decision: not a fit this quarter",
    });
  noPace.add(mission.id);
  await requestExport(db, auth, mission.id, { forceMock: true });
  await drainMission(db, mission.id);
  noPace.delete(mission.id);

  // ---- in-progress mission (runs live with pacing once a worker picks it up)
  if (opts.inProgressMission !== false) {
    const [m2] = await db
      .insert(schema.missions)
      .values({
        organizationId: org.id,
        createdBy: user.id,
        title: "Sample: UK help-desk users (live run)",
        goal: "Find 8 UK and Canadian SaaS teams already running a help desk, qualify them and prepare drafts.",
        productContext: SAMPLE_PROFILE.productDescription,
        icp: SAMPLE_PROFILE.icp,
        geography: "United Kingdom and Canada",
        exclusions: SAMPLE_PROFILE.exclusions,
        deliverables: [
          "Qualified leads with evidence",
          "Editable outreach drafts",
        ],
        requestedCount: 8,
        mode: "demo",
        isSample: true,
        // This one runs for real on the configured orchestrator (e.g. RocketRide).
        orchestrator: providers().orchestrator.id,
      })
      .returning();
    await createTaskGraph(db, m2);
    await setMissionStatus(db, m2.id, "queued");
    await scheduleReady(db, m2.id);
  }
  return { orgId: org.id, userId: user.id, created: true };
}

export function demoSlug() {
  return `demo-${crypto.randomBytes(5).toString("hex")}`;
}
