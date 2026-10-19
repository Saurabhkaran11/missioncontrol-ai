import { body, route } from "@/server/api";
import { createMission, listMissions } from "@/server/services/missions";
import { MissionInput } from "@/shared/schemas";

export const GET = route(async ({ db, auth }) => ({
  missions: await listMissions(db, auth.orgId),
}));

export const POST = route(
  async ({ req, db, auth }) => {
    const mission = await createMission(
      db,
      auth,
      await body(req, MissionInput),
    );
    return Response.json({ mission }, { status: 201 });
  },
  {
    perm: "mission.write",
    rateLimit: { key: "mission.create", max: 10, windowSeconds: 3600 },
  },
);
