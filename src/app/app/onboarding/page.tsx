import { getDb } from "@/db/client";
import { currentContext } from "@/server/auth";
import { getProfile } from "@/server/services/org";
import { SAMPLE_PROFILE } from "@/db/seed";
import { OnboardingForm } from "@/components/onboarding-form";
import { Card, PageHeader } from "@/components/ui";

export default async function Onboarding() {
  const auth = (await currentContext())!;
  const p = await getProfile(await getDb(), auth.orgId);
  const initial = p
    ? {
        companyName: p.companyName,
        productDescription: p.productDescription,
        icp: p.icp,
        geography: p.geography,
        exclusions: p.exclusions,
        tone: p.tone,
        desiredOutput: p.desiredOutput,
      }
    : { ...SAMPLE_PROFILE, companyName: "", productDescription: "" };
  return (
    <>
      <PageHeader
        title={
          p
            ? "Workspace profile"
            : "Welcome — tell the team about your business"
        }
        sub="These answers become the defaults for every mission. The example ICP below is editable."
      />
      <Card className="max-w-3xl p-6">
        <OnboardingForm initial={initial} />
      </Card>
    </>
  );
}
