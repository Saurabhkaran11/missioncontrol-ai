import { body, route } from "@/server/api";
import { getProfile, saveOnboarding } from "@/server/services/org";
import { OnboardingInput } from "@/shared/schemas";

export const GET = route(async ({ db, auth }) => ({
  profile: await getProfile(db, auth.orgId),
}));
export const PUT = route(
  async ({ req, db, auth }) => {
    await saveOnboarding(db, auth, await body(req, OnboardingInput));
    return { ok: true };
  },
  { perm: "settings.manage" },
);
