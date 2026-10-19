import { route } from "@/server/api";
import { exportOrgData } from "@/server/services/org";

export const GET = route(
  async ({ db, auth }) => {
    const data = await exportOrgData(db, auth);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition":
          'attachment; filename="missioncontrol-export.json"',
      },
    });
  },
  { perm: "settings.manage" },
);
