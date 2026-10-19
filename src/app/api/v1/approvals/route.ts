import { route } from "@/server/api";
import { listApprovals } from "@/server/services/leads";

export const GET = route(async ({ req, db, auth }) => ({
  approvals: await listApprovals(
    db,
    auth.orgId,
    req.nextUrl.searchParams.get("status") === "all" ? "all" : "pending",
  ),
}));
