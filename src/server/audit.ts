import { schema, type DbOrTx } from "@/db/client";

/**
 * Audit, usage and product analytics writers.
 * Audit metadata must not contain secrets or personal data — callers pass ids
 * and short enum-like values only, e.g.
 *   audit(db, { orgId, actorType: "user", actorId, action: "approval.approve", targetType: "approval", targetId })
 */
export async function audit(
  db: DbOrTx,
  e: {
    orgId: string | null;
    actorType: "user" | "agent" | "system";
    actorId?: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
    correlationId?: string;
  },
) {
  await db.insert(schema.auditLog).values({
    organizationId: e.orgId,
    actorType: e.actorType,
    actorId: e.actorId ?? null,
    action: e.action,
    targetType: e.targetType ?? null,
    targetId: e.targetId ?? null,
    metadata: e.metadata ?? {},
    correlationId: e.correlationId ?? null,
  });
}

export const currentPeriod = (d = new Date()) => d.toISOString().slice(0, 7);

export async function recordUsage(
  db: DbOrTx,
  orgId: string,
  metric: string,
  quantity = 1,
) {
  await db
    .insert(schema.usageRecords)
    .values({
      organizationId: orgId,
      metric,
      quantity,
      period: currentPeriod(),
    });
}

/** Privacy-minimised product event: name + a few scalar properties, no free text. */
export async function track(
  db: DbOrTx,
  orgId: string | null,
  name: string,
  properties: Record<string, string | number | boolean> = {},
) {
  await db
    .insert(schema.productEvents)
    .values({ organizationId: orgId, name, properties });
}
