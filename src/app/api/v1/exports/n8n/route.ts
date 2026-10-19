import { body, route } from "@/server/api";
import { requestExport } from "@/server/services/leads";
import { ExportInput } from "@/shared/schemas";

export const POST = route(
  async ({ req, db, auth }) =>
    requestExport(db, auth, (await body(req, ExportInput)).missionId),
  {
    perm: "export.run",
    rateLimit: { key: "export", max: 20, windowSeconds: 600 },
  },
);
