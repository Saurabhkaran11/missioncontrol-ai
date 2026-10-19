import { and, eq, gte, sql } from "drizzle-orm";
import { schema, type DB } from "@/db/client";

/**
 * Execution metrics computed from stored records only — no hard-coded
 * numbers. Labels are deliberate: drafts are "ready", never "sent"; exports
 * are "records exported", never "deals" or "revenue".
 */
export async function orgMetrics(db: DB, orgId: string) {
  const leadRows = await db
    .select({ status: schema.leads.status, n: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(eq(schema.leads.organizationId, orgId))
    .groupBy(schema.leads.status);
  const by = Object.fromEntries(leadRows.map((r) => [r.status, r.n])) as Record<
    string,
    number
  >;
  const [drafts] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.outreachDrafts)
    .where(
      and(
        eq(schema.outreachDrafts.organizationId, orgId),
        eq(schema.outreachDrafts.status, "ready"),
      ),
    );
  const deliveries = await db
    .select({
      state: schema.webhookDeliveries.state,
      mode: schema.webhookDeliveries.mode,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.webhookDeliveries)
    .where(eq(schema.webhookDeliveries.organizationId, orgId))
    .groupBy(schema.webhookDeliveries.state, schema.webhookDeliveries.mode);
  const missions = await db
    .select({ status: schema.missions.status, n: sql<number>`count(*)::int` })
    .from(schema.missions)
    .where(eq(schema.missions.organizationId, orgId))
    .groupBy(schema.missions.status);
  const [withEvidence] = await db
    .select({
      total: sql<number>`count(*)::int`,
      cited: sql<number>`count(*) filter (where exists (select 1 from evidence_sources e where e.lead_id = leads.id))::int`,
    })
    .from(schema.leads)
    .where(
      and(eq(schema.leads.organizationId, orgId), sql`status <> 'duplicate'`),
    );
  const decisions = await db
    .select({
      decision: schema.approvalDecisions.decision,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.approvalDecisions)
    .where(eq(schema.approvalDecisions.organizationId, orgId))
    .groupBy(schema.approvalDecisions.decision);
  const [ttfr] = await db
    .select({
      secs: sql<
        number | null
      >`percentile_cont(0.5) within group (order by extract(epoch from (t.finished_at - m.started_at)))`,
    })
    .from(sql`mission_tasks t join missions m on m.id = t.mission_id`)
    .where(
      sql`m.organization_id = ${orgId} and t.task_type = 'alex.request_approvals' and t.status = 'succeeded'`,
    );
  const delivered = deliveries.filter((d) => d.state === "delivered");
  const researched = leadRows.reduce((n, r) => n + r.n, 0);
  return {
    researched,
    qualified: (by.qualified ?? 0) + (by.approved ?? 0) + (by.exported ?? 0),
    needsReview: by.needs_review ?? 0,
    rejected: by.rejected ?? 0,
    duplicates: by.duplicate ?? 0,
    draftsReady: drafts?.n ?? 0,
    approved: (by.approved ?? 0) + (by.exported ?? 0),
    exportedLive: delivered
      .filter((d) => d.mode === "live")
      .reduce((n, d) => n + d.n, 0),
    exportedMock: delivered
      .filter((d) => d.mode === "mock")
      .reduce((n, d) => n + d.n, 0),
    exportFailures: deliveries
      .filter((d) => d.state === "dead")
      .reduce((n, d) => n + d.n, 0),
    missions: Object.fromEntries(
      missions.map((m) => [m.status, m.n]),
    ) as Record<string, number>,
    evidenceCoverage: withEvidence?.total
      ? Math.round((withEvidence.cited / withEvidence.total) * 100)
      : null,
    decisions: Object.fromEntries(
      decisions.map((d) => [d.decision, d.n]),
    ) as Record<string, number>,
    medianSecondsToApprovalReady: ttfr?.secs ? Math.round(ttfr.secs) : null,
  };
}

/** Cross-tenant funnel for operators: counts of product events only, no tenant data. */
export async function funnel(db: DB, since: Date) {
  const rows = await db
    .select({
      name: schema.productEvents.name,
      orgs: sql<number>`count(distinct organization_id)::int`,
    })
    .from(schema.productEvents)
    .where(gte(schema.productEvents.createdAt, since))
    .groupBy(schema.productEvents.name);
  return Object.fromEntries(rows.map((r) => [r.name, r.orgs]));
}
