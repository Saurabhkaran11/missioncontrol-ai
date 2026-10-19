import { route } from "@/server/api";
import { missionDetail } from "@/server/services/missions";

export const GET = route(async ({ db, auth, params }) =>
  missionDetail(db, auth.orgId, params.missionId),
);
