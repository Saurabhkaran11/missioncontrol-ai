import { body, route } from "@/server/api";
import { decideApproval } from "@/server/services/leads";
import { ApprovalDecisionInput } from "@/shared/schemas";

export const POST = route(
  async ({ req, db, auth, params }) =>
    decideApproval(
      db,
      auth,
      params.approvalId,
      await body(req, ApprovalDecisionInput),
    ),
  { perm: "approval.decide" },
);
