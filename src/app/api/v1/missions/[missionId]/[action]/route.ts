import { route } from "@/server/api";
import {
  cancelMission,
  pauseMission,
  resumeMission,
  startMission,
} from "@/server/services/missions";
import { notFound } from "@/shared/errors";

// POST /api/v1/missions/:id/{start|pause|resume|cancel} — all idempotent.
const ACTIONS = {
  start: startMission,
  pause: pauseMission,
  resume: resumeMission,
  cancel: cancelMission,
} as const;

export const POST = route(
  async ({ db, auth, params }) => {
    const fn = ACTIONS[params.action as keyof typeof ACTIONS];
    if (!fn) throw notFound("Action");
    return { mission: await fn(db, auth, params.missionId) };
  },
  { perm: "mission.write" },
);
