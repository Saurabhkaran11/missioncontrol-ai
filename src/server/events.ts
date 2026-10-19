import { schema, type DbOrTx } from "@/db/client";
import type { AgentEvent } from "@/db/schema";

/**
 * Appends a user-safe event to the mission activity feed. Messages are short
 * status lines written by our code (never model reasoning); `data` carries
 * structured artifacts such as handoff payload summaries.
 * Example: emit(db, { orgId, missionId, agent: "leo", to: "sophia", type: "handoff",
 *   message: "Handed 14 qualified leads to Sophia", data: { leadIds } })
 */
export async function emit(
  db: DbOrTx,
  e: {
    orgId: string;
    missionId: string;
    taskId?: string | null;
    agent?: string | null;
    to?: string | null;
    type: AgentEvent["type"];
    message: string;
    data?: Record<string, unknown>;
  },
) {
  await db.insert(schema.agentEvents).values({
    organizationId: e.orgId,
    missionId: e.missionId,
    taskId: e.taskId ?? null,
    agentSlug: e.agent ?? null,
    toAgentSlug: e.to ?? null,
    type: e.type,
    message: e.message.slice(0, 500),
    data: e.data ?? {},
  });
}
