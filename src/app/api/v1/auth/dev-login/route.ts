import { body, route } from "@/server/api";
import { createSession, setSessionCookie } from "@/server/auth";
import { devLogin } from "@/server/services/org";
import { audit } from "@/server/audit";
import { env } from "@/shared/env";
import { AppError } from "@/shared/errors";
import { DevLoginInput } from "@/shared/schemas";

// Password-less local sign-in for development and demos only. Disabled when
// DEMO_MODE=false; production uses Supabase Auth (see docs/operations.md).
export const POST = route(
  async ({ req, db }) => {
    if (!env().DEMO_MODE || env().NODE_ENV === "production")
      throw new AppError(
        "dev_login_disabled",
        "Local sign-in is disabled; use your identity provider",
        403,
      );
    const input = await body(req, DevLoginInput);
    const r = await devLogin(db, input.email, input.name);
    const s = await createSession(db, r.userId, r.orgId);
    await setSessionCookie(s.token, s.expiresAt);
    await audit(db, {
      orgId: r.orgId,
      actorType: "user",
      actorId: r.userId,
      action: "auth.login",
      metadata: { method: "local-dev" },
    });
    return { redirect: r.isNew ? "/app/onboarding" : "/app" };
  },
  {
    public: true,
    rateLimit: { key: "auth.login", max: 10, windowSeconds: 300 },
  },
);
