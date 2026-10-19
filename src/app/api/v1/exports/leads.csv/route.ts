import { route } from "@/server/api";
import { leadsCsv } from "@/server/services/leads";
import { audit } from "@/server/audit";

export const GET = route(async ({ req, db, auth }) => {
  const missionId = req.nextUrl.searchParams.get("missionId") ?? undefined;
  const csv = await leadsCsv(
    db,
    auth.orgId,
    missionId && /^[0-9a-f-]{36}$/i.test(missionId) ? missionId : undefined,
  );
  await audit(db, {
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "export.csv",
  });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="missioncontrol-leads.csv"',
    },
  });
});
