import { getDb } from "@/db/client";
import { currentContext } from "@/server/auth";
import { getProfile } from "@/server/services/org";
import { resolveLeadSink } from "@/server/services/integrations";
import { providers } from "@/integrations";
import { PRIMARY_GOAL, SAMPLE_PROFILE } from "@/db/seed";
import { MissionComposer } from "@/components/mission-composer";
import { PageHeader } from "@/components/ui";

export default async function NewMission() {
  const auth = (await currentContext())!;
  const db = await getDb();
  const p = (await getProfile(db, auth.orgId)) ?? SAMPLE_PROFILE;
  const sink = await resolveLeadSink(db, auth.orgId);
  return (
    <>
      <PageHeader
        title="New mission"
        sub="Guided template: the defaults come from your workspace profile. Edit anything before you start."
      />
      <MissionComposer
        defaults={{
          goal: PRIMARY_GOAL,
          productContext: p.productDescription,
          icp: p.icp,
          geography: p.geography,
          exclusions: p.exclusions,
        }}
        liveResearch={providers().research.mode === "live"}
        exportMode={sink.mode === "demo" ? "mock" : "live"}
      />
    </>
  );
}
