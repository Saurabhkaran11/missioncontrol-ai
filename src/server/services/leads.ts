import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { schema, type DB } from "@/db/client";
import type { AuthContext } from "@/server/auth";
import { audit, track } from "@/server/audit";
import { emit } from "@/server/events";
import { AppError, conflict, forbidden, notFound } from "@/shared/errors";
import { dedupeKey } from "@/features/dedupe";
import { reviewDraft, verdictFor } from "@/features/review";
import { checkExportable, roleCan } from "@/features/approval-policy";
import {
  currentPayload,
  openApprovalForLead,
  queueTask,
} from "@/workers/engine";
import { getOwnedMission } from "./missions";

const UUID = /^[0-9a-f-]{36}$/i;

export async function getOwnedLead(db: DB, orgId: string, leadId: string) {
  if (!UUID.test(leadId)) throw notFound("Lead");
  const [l] = await db
    .select()
    .from(schema.leads)
    .where(
      and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)),
    );
  if (!l) throw notFound("Lead");
  return l;
}

export type LeadFilter = { missionId?: string; q?: string; status?: string };

export async function listLeads(db: DB, orgId: string, f: LeadFilter = {}) {
  const where = [eq(schema.leads.organizationId, orgId)];
  if (f.missionId) where.push(eq(schema.leads.missionId, f.missionId));
  if (f.status) where.push(eq(schema.leads.status, f.status as never));
  if (f.q)
    where.push(
      or(
        ilike(schema.leads.companyName, `%${f.q.replace(/[%_]/g, "")}%`),
        ilike(schema.leads.domain, `%${f.q.replace(/[%_]/g, "")}%`),
      )!,
    );
  const rows = await db
    .select({
      lead: schema.leads,
      sourceCount: sql<number>`(select count(*)::int from evidence_sources e where e.lead_id = ${schema.leads.id})`,
      draftStatus: sql<
        string | null
      >`(select d.status from outreach_drafts d where d.id = ${schema.leads.currentDraftId})`,
      approvalStatus: sql<
        string | null
      >`(select a.status from approval_requests a where a.lead_id = ${schema.leads.id} order by a.created_at desc limit 1)`,
      missionTitle: schema.missions.title,
    })
    .from(schema.leads)
    .innerJoin(schema.missions, eq(schema.missions.id, schema.leads.missionId))
    .where(and(...where))
    .orderBy(desc(schema.leads.score), asc(schema.leads.companyName))
    .limit(500);
  return rows;
}

export async function leadDetail(db: DB, orgId: string, leadId: string) {
  const lead = await getOwnedLead(db, orgId, leadId);
  const [evidence, drafts, reviews, approvals] = await Promise.all([
    db
      .select()
      .from(schema.evidenceSources)
      .where(
        and(
          eq(schema.evidenceSources.leadId, leadId),
          eq(schema.evidenceSources.organizationId, orgId),
        ),
      ),
    db
      .select()
      .from(schema.outreachDrafts)
      .where(
        and(
          eq(schema.outreachDrafts.leadId, leadId),
          eq(schema.outreachDrafts.organizationId, orgId),
        ),
      )
      .orderBy(desc(schema.outreachDrafts.version)),
    db
      .select()
      .from(schema.reviewFindings)
      .where(
        and(
          eq(schema.reviewFindings.leadId, leadId),
          eq(schema.reviewFindings.organizationId, orgId),
        ),
      )
      .orderBy(desc(schema.reviewFindings.createdAt)),
    db
      .select()
      .from(schema.approvalRequests)
      .where(
        and(
          eq(schema.approvalRequests.leadId, leadId),
          eq(schema.approvalRequests.organizationId, orgId),
        ),
      )
      .orderBy(desc(schema.approvalRequests.createdAt)),
  ]);
  const duplicateOf = lead.duplicateOfLeadId
    ? ((
        await db
          .select({
            id: schema.leads.id,
            companyName: schema.leads.companyName,
            missionId: schema.leads.missionId,
          })
          .from(schema.leads)
          .where(
            and(
              eq(schema.leads.id, lead.duplicateOfLeadId),
              eq(schema.leads.organizationId, orgId),
            ),
          )
      )[0] ?? null)
    : null;
  return { lead, evidence, drafts, reviews, approvals, duplicateOf };
}

/**
 * Human edit of a lead and/or its draft. Uses optimistic concurrency
 * (`expectedVersion`), records an audit entry, re-runs Sam's checks on an
 * edited draft and — because the exportable payload changed — supersedes any
 * existing approval and opens a fresh one.
 */
export async function patchLead(
  db: DB,
  auth: AuthContext,
  leadId: string,
  patch: {
    companyName?: string;
    domain?: string | null;
    rationale?: string;
    status?: "qualified" | "rejected" | "needs_review";
    draft?: { subject: string; body: string };
    expectedVersion: number;
  },
) {
  const lead = await getOwnedLead(db, auth.orgId, leadId);
  if (lead.version !== patch.expectedVersion)
    throw conflict(
      "version_conflict",
      "This lead was changed by someone else; reload and try again",
    );
  if (["exported", "duplicate"].includes(lead.status))
    throw conflict("locked", `A ${lead.status} lead cannot be edited`);

  const changes: Record<string, unknown> = {};
  await db.transaction(async (tx) => {
    const set: Partial<typeof schema.leads.$inferInsert> = {
      version: lead.version + 1,
      updatedAt: new Date(),
    };
    if (patch.companyName !== undefined)
      set.companyName = changes.companyName = patch.companyName;
    if (patch.rationale !== undefined)
      set.rationale = changes.rationale = patch.rationale;
    if (patch.status !== undefined) set.status = changes.status = patch.status;
    if (patch.domain !== undefined) {
      set.domain = changes.domain = patch.domain;
      set.dedupeKey = dedupeKey(
        patch.companyName ?? lead.companyName,
        patch.domain,
      );
    }
    if (patch.draft) {
      const [prev] = lead.currentDraftId
        ? await tx
            .select()
            .from(schema.outreachDrafts)
            .where(eq(schema.outreachDrafts.id, lead.currentDraftId))
        : [];
      const id = crypto.randomUUID();
      // Personalisations survive only if their text is still present verbatim.
      const personalizations = (prev?.personalizations ?? []).filter(
        (p) =>
          patch.draft!.body.includes(p.text) ||
          patch
            .draft!.body.toLowerCase()
            .includes(p.text.toLowerCase().slice(0, 40)),
      );
      const ev = await tx
        .select()
        .from(schema.evidenceSources)
        .where(eq(schema.evidenceSources.leadId, leadId));
      const evMap = new Map(
        ev.map((e) => [
          e.id,
          {
            excerpt: e.excerpt,
            leadId: e.leadId,
            url: e.url,
            injectionSuspected: e.injectionSuspected,
          },
        ]),
      );
      const findings = reviewDraft(
        { ...patch.draft, personalizations },
        leadId,
        evMap,
      );
      const verdict = verdictFor(findings);
      if (prev)
        await tx
          .update(schema.outreachDrafts)
          .set({ status: "superseded" })
          .where(eq(schema.outreachDrafts.id, prev.id));
      await tx.insert(schema.outreachDrafts).values({
        id,
        organizationId: auth.orgId,
        missionId: lead.missionId,
        leadId,
        version: (prev?.version ?? 0) + 1,
        subject: patch.draft.subject,
        body: patch.draft.body,
        personalizations,
        status: verdict === "pass" ? "ready" : "needs_revision",
        revisionOfId: prev?.id ?? null,
        editedByUserId: auth.userId,
        generator: "human-edit",
      });
      await tx
        .insert(schema.reviewFindings)
        .values({
          organizationId: auth.orgId,
          missionId: lead.missionId,
          leadId,
          draftId: id,
          round: 99,
          verdict,
          findings,
        });
      set.currentDraftId = id;
      changes.draft = {
        version: (prev?.version ?? 0) + 1,
        samVerdict: verdict,
      };
    }
    await tx
      .update(schema.leads)
      .set(set)
      .where(
        and(
          eq(schema.leads.id, leadId),
          eq(schema.leads.organizationId, auth.orgId),
        ),
      );
  });

  const updated = await getOwnedLead(db, auth.orgId, leadId);
  if (updated.status === "rejected") {
    await db
      .update(schema.approvalRequests)
      .set({ status: "superseded" })
      .where(
        and(
          eq(schema.approvalRequests.leadId, leadId),
          inArray(schema.approvalRequests.status, ["pending", "approved"]),
        ),
      );
  } else if (updated.currentDraftId) {
    await openApprovalForLead(db, leadId); // supersedes the stale approval if the payload hash changed
  }
  await audit(db, {
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "lead.edit",
    targetType: "lead",
    targetId: leadId,
    metadata: { fields: Object.keys(changes), version: updated.version },
  });
  await emit(db, {
    orgId: auth.orgId,
    missionId: lead.missionId,
    type: "human",
    message: `${auth.userName} edited ${updated.companyName} (${Object.keys(changes).join(", ")}); approval re-requested for the new version`,
  });
  return updated;
}

// ---------------------------------------------------------------- approvals

export async function listApprovals(
  db: DB,
  orgId: string,
  status: "pending" | "all" = "pending",
) {
  const where = [eq(schema.approvalRequests.organizationId, orgId)];
  if (status === "pending")
    where.push(eq(schema.approvalRequests.status, "pending"));
  return db
    .select({
      approval: schema.approvalRequests,
      lead: schema.leads,
      missionTitle: schema.missions.title,
    })
    .from(schema.approvalRequests)
    .innerJoin(
      schema.leads,
      eq(schema.leads.id, schema.approvalRequests.leadId),
    )
    .innerJoin(
      schema.missions,
      eq(schema.missions.id, schema.approvalRequests.missionId),
    )
    .where(and(...where))
    .orderBy(desc(schema.leads.score))
    .limit(200);
}

/**
 * Records a human decision on one exact payload version. The client must send
 * the payload hash it reviewed; if the lead changed since, the decision is
 * refused (409) so nobody approves something they did not see.
 * Agents can never call this: it requires a signed-in user with approval rights.
 */
export async function decideApproval(
  db: DB,
  auth: AuthContext,
  approvalId: string,
  input: {
    decision: "approve" | "reject" | "request_revision";
    payloadHash: string;
    reason?: string;
  },
) {
  if (!roleCan(auth.role, "approval.decide"))
    throw forbidden("Only owners and admins can decide approvals");
  if (!UUID.test(approvalId)) throw notFound("Approval");
  const [a] = await db
    .select()
    .from(schema.approvalRequests)
    .where(
      and(
        eq(schema.approvalRequests.id, approvalId),
        eq(schema.approvalRequests.organizationId, auth.orgId),
      ),
    );
  if (!a) throw notFound("Approval");
  if (a.status !== "pending")
    throw conflict("already_decided", `This approval is already ${a.status}`);
  if (a.payloadHash !== input.payloadHash)
    throw conflict(
      "stale_payload",
      "You reviewed a different version of this payload; reload and review again",
    );
  const cur = await currentPayload(db, a.leadId);
  if (!cur || cur.hash !== a.payloadHash) {
    await db
      .update(schema.approvalRequests)
      .set({ status: "superseded" })
      .where(eq(schema.approvalRequests.id, a.id));
    throw conflict(
      "stale_payload",
      "The lead or draft changed since this approval was requested",
    );
  }

  const statusFor = {
    approve: "approved",
    reject: "rejected",
    request_revision: "revision_requested",
  } as const;
  await db.transaction(async (tx) => {
    await tx
      .update(schema.approvalRequests)
      .set({ status: statusFor[input.decision], decidedAt: new Date() })
      .where(eq(schema.approvalRequests.id, a.id));
    await tx
      .insert(schema.approvalDecisions)
      .values({
        organizationId: auth.orgId,
        approvalRequestId: a.id,
        decision: input.decision,
        reason: input.reason ?? null,
        payloadHash: a.payloadHash,
        decidedBy: auth.userId,
      });
    if (input.decision === "approve")
      await tx
        .update(schema.leads)
        .set({ status: "approved", stage: "approved", updatedAt: new Date() })
        .where(eq(schema.leads.id, a.leadId));
    if (input.decision === "reject")
      await tx
        .update(schema.leads)
        .set({
          status: "rejected",
          stage: "rejected by human",
          updatedAt: new Date(),
        })
        .where(eq(schema.leads.id, a.leadId));
    if (input.decision === "request_revision" && cur.draft)
      await tx
        .update(schema.outreachDrafts)
        .set({ status: "needs_revision" })
        .where(eq(schema.outreachDrafts.id, cur.draft.id));
  });

  if (input.decision === "request_revision")
    await requestRevision(db, auth, a.missionId, a.leadId, input.reason ?? "");
  await audit(db, {
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: `approval.${input.decision}`,
    targetType: "approval",
    targetId: a.id,
    metadata: { leadId: a.leadId, payloadVersion: a.payloadVersion },
  });
  await track(db, auth.orgId, "approval_decided", { decision: input.decision });
  await emit(db, {
    orgId: auth.orgId,
    missionId: a.missionId,
    type: "human",
    message: `${auth.userName} ${input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "requested a revision of"} ${cur.lead.companyName} (payload v${a.payloadVersion})${input.reason ? ` — "${input.reason.slice(0, 120)}"` : ""}`,
  });
  return { status: statusFor[input.decision] };
}

/** Human-requested revision: a new Sophia → Sam → Alex mini-graph for one lead. */
async function requestRevision(
  db: DB,
  auth: AuthContext,
  missionId: string,
  leadId: string,
  reason: string,
) {
  const mission = await getOwnedMission(db, auth.orgId, missionId);
  if (["cancelled", "failed"].includes(mission.status))
    throw new AppError("mission_closed", `Mission is ${mission.status}`, 409);
  if (mission.status === "succeeded")
    await db
      .update(schema.missions)
      .set({ status: "needs_approval", completedAt: null })
      .where(eq(schema.missions.id, missionId));
  const id = () => crypto.randomUUID();
  const [revise, recheck, request] = [id(), id(), id()];
  const base = {
    organizationId: auth.orgId,
    missionId,
    status: "pending" as const,
    input: { leadIds: [leadId], humanReason: reason },
  };
  await db.insert(schema.missionTasks).values([
    {
      ...base,
      id: revise,
      agentSlug: "sophia",
      taskType: "sophia.revise",
      title: "Revise draft per your feedback",
      position: 900,
      idempotencyKey: `${missionId}:human-revise:${revise}`,
    },
    {
      ...base,
      id: recheck,
      agentSlug: "sam",
      taskType: "sam.recheck",
      title: "Re-review revised draft",
      position: 910,
      idempotencyKey: `${missionId}:human-recheck:${recheck}`,
    },
    {
      ...base,
      id: request,
      agentSlug: "alex",
      taskType: "alex.request_approvals",
      title: "Re-request approval",
      position: 920,
      idempotencyKey: `${missionId}:human-approval:${request}`,
    },
  ]);
  await db.insert(schema.taskDependencies).values([
    { organizationId: auth.orgId, taskId: recheck, dependsOnTaskId: revise },
    { organizationId: auth.orgId, taskId: request, dependsOnTaskId: recheck },
  ]);
  const [t] = await db
    .select()
    .from(schema.missionTasks)
    .where(eq(schema.missionTasks.id, revise));
  await queueTask(db, t);
}

// ---------------------------------------------------------------- export

/**
 * Starts an n8n export for a mission. Only approvals whose hash still matches
 * the current payload become outbox rows; stale ones are superseded and
 * reported. The unique idempotency key (approvalId:hash) means clicking
 * "Send" twice never creates a second delivery.
 */
export async function requestExport(
  db: DB,
  auth: AuthContext,
  missionId: string,
) {
  const mission = await getOwnedMission(db, auth.orgId, missionId);
  const { resolveLeadSink } = await import("./integrations");
  const sink = await resolveLeadSink(db, auth.orgId);
  if (mission.mode === "live" && sink.mode === "demo")
    throw conflict(
      "integration_not_configured",
      "Configure and test the n8n connection before exporting a live mission",
    );

  const approved = await db
    .select()
    .from(schema.approvalRequests)
    .where(
      and(
        eq(schema.approvalRequests.missionId, missionId),
        eq(schema.approvalRequests.organizationId, auth.orgId),
        eq(schema.approvalRequests.status, "approved"),
      ),
    );
  const stale: string[] = [];
  let queued = 0;
  for (const a of approved) {
    const cur = await currentPayload(db, a.leadId);
    const check = cur ? checkExportable(a, cur.hash) : ({ ok: false } as const);
    if (!check.ok) {
      stale.push(a.leadId);
      await db
        .update(schema.approvalRequests)
        .set({ status: "superseded" })
        .where(eq(schema.approvalRequests.id, a.id));
      continue;
    }
    const res = await db
      .insert(schema.webhookDeliveries)
      .values({
        organizationId: auth.orgId,
        missionId,
        approvalRequestId: a.id,
        idempotencyKey: `${a.id}:${a.payloadHash}`,
        payloadHash: a.payloadHash,
        destination: a.destination,
        mode: sink.mode === "demo" ? "mock" : "live",
      })
      .onConflictDoNothing()
      .returning({ id: schema.webhookDeliveries.id });
    queued += res.length;
  }
  if (!queued && !stale.length)
    throw conflict("nothing_to_export", "No newly approved records to export");

  if (queued) {
    // Release Jordan: reuse the pending export task, or add a new export → summary pair.
    const [pendingExport] = await db
      .select()
      .from(schema.missionTasks)
      .where(
        and(
          eq(schema.missionTasks.missionId, missionId),
          eq(schema.missionTasks.taskType, "jordan.export"),
          inArray(schema.missionTasks.status, ["pending", "needs_approval"]),
        ),
      );
    let exportTask = pendingExport;
    if (!exportTask) {
      const exportId = crypto.randomUUID();
      const sumId = crypto.randomUUID();
      await db.insert(schema.missionTasks).values([
        {
          id: exportId,
          organizationId: auth.orgId,
          missionId,
          agentSlug: "jordan",
          taskType: "jordan.export",
          title: "Send newly approved records to n8n",
          status: "pending",
          position: 950,
          idempotencyKey: `${missionId}:jordan.export:${exportId}`,
        },
        {
          id: sumId,
          organizationId: auth.orgId,
          missionId,
          agentSlug: "alex",
          taskType: "alex.summarize",
          title: "Update mission summary",
          status: "pending",
          position: 960,
          idempotencyKey: `${missionId}:alex.summarize:${sumId}`,
        },
      ]);
      await db
        .insert(schema.taskDependencies)
        .values({
          organizationId: auth.orgId,
          taskId: sumId,
          dependsOnTaskId: exportId,
        });
      [exportTask] = await db
        .select()
        .from(schema.missionTasks)
        .where(eq(schema.missionTasks.id, exportId));
    }
    if (["needs_approval", "succeeded"].includes(mission.status))
      await db
        .update(schema.missions)
        .set({ status: "running", completedAt: null })
        .where(eq(schema.missions.id, missionId));
    await queueTask(db, exportTask);
  }
  await audit(db, {
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "export.requested",
    targetType: "mission",
    targetId: missionId,
    metadata: { queued, stale: stale.length, mode: sink.mode },
  });
  await track(db, auth.orgId, "export_requested", { queued, mode: sink.mode });
  await emit(db, {
    orgId: auth.orgId,
    missionId,
    type: "human",
    message: `${auth.userName} released ${queued} approved record${queued === 1 ? "" : "s"} to Jordan${stale.length ? `; ${stale.length} stale approval${stale.length === 1 ? "" : "s"} need re-approval` : ""}`,
  });
  return { queued, stale, mode: sink.mode === "demo" ? "mock" : "live" };
}

/** CSV with formula-injection protection: cells starting with = + - @ tab or CR are prefixed with '. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function leadsCsv(db: DB, orgId: string, missionId?: string) {
  const rows = await listLeads(db, orgId, { missionId });
  const header = [
    "company",
    "domain",
    "score",
    "status",
    "stage",
    "confidence",
    "sources",
    "draft_status",
    "approval_status",
    "rationale",
    "mission",
    "sample_data",
  ];
  const lines = rows.map((r) =>
    [
      r.lead.companyName,
      r.lead.domain,
      r.lead.score,
      r.lead.status,
      r.lead.stage,
      r.lead.confidence,
      r.sourceCount,
      r.draftStatus,
      r.approvalStatus,
      r.lead.rationale,
      r.missionTitle,
      r.lead.isSample ? "yes" : "no",
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n");
}
