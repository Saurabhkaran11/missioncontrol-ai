import { route } from "@/server/api";
import { createSession, setSessionCookie } from "@/server/auth";
import { createDemoWorkspace } from "@/server/services/org";
import { env } from "@/shared/env";
import { AppError } from "@/shared/errors";

// Enter the sample workspace: a fresh, isolated, clearly-labelled demo
// organization per visitor, so visitors never see each other's actions.
export const POST = route(
  async ({ db }) => {
    if (!env().DEMO_MODE)
      throw new AppError(
        "demo_disabled",
        "Demo mode is disabled on this deployment",
        403,
      );
    const { orgId, userId } = await createDemoWorkspace(db);
    const s = await createSession(db, userId, orgId);
    await setSessionCookie(s.token, s.expiresAt);
    return { redirect: "/app" };
  },
  {
    public: true,
    rateLimit: { key: "auth.demo", max: 10, windowSeconds: 600 },
  },
);
