import { route } from "@/server/api";
import { getOwnedMission } from "@/server/services/missions";
import { listLeads } from "@/server/services/leads";

export const GET = route(async ({ req, db, auth, params }) => {
  await getOwnedMission(db, auth.orgId, params.missionId);
  const q = req.nextUrl.searchParams;
  return {
    leads: await listLeads(db, auth.orgId, {
      missionId: params.missionId,
      q: q.get("q") ?? undefined,
      status: q.get("status") ?? undefined,
    }),
  };
});
