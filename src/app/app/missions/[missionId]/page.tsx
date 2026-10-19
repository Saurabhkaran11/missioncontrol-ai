import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { currentContext } from "@/server/auth";
import { missionDetail, missionEvents } from "@/server/services/missions";
import { providers } from "@/integrations";
import { AGENT_ORDER } from "@/features/agents/profiles";
import { roleCan } from "@/features/approval-policy";
import { AppError } from "@/shared/errors";
import { MissionRoom } from "@/components/mission-room";

export default async function MissionPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = await params;
  const auth = (await currentContext())!;
  const db = await getDb();
  let detail;
  try {
    detail = await missionDetail(db, auth.orgId, missionId);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const events = await missionEvents(db, auth.orgId, missionId, 0);
  const identities = await Promise.all(
    AGENT_ORDER.map((s) => providers().avatars.identity(s)),
  );
  return (
    <MissionRoom
      initial={JSON.parse(JSON.stringify(detail))}
      initialEvents={JSON.parse(JSON.stringify(events))}
      identities={identities}
      canWrite={roleCan(auth.role, "mission.write")}
      canExport={roleCan(auth.role, "export.run")}
    />
  );
}
