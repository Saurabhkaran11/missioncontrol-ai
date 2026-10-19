import { body, route } from "@/server/api";
import { decideApproval } from "@/server/services/leads";
import { BulkDecisionInput } from "@/shared/schemas";

// Bulk review requires `confirm: true` and the exact hash of each item reviewed.
export const POST = route(
  async ({ req, db, auth }) => {
    const input = await body(req, BulkDecisionInput);
    const results = [];
    for (const item of input.items) {
      try {
        await decideApproval(db, auth, item.approvalId, {
          decision: input.decision,
          payloadHash: item.payloadHash,
          reason:
            input.reason ??
            (input.decision === "approve" ? undefined : "Bulk rejection"),
        });
        results.push({ approvalId: item.approvalId, ok: true });
      } catch (e) {
        results.push({
          approvalId: item.approvalId,
          ok: false,
          error: e instanceof Error ? e.message : "failed",
        });
      }
    }
    return { results };
  },
  { perm: "approval.decide" },
);
