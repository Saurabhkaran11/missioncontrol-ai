import { body, route } from "@/server/api";
import { schema } from "@/db/client";
import { track } from "@/server/audit";
import { WaitlistInput } from "@/shared/schemas";

export const POST = route(
  async ({ req, db }) => {
    const input = await body(req, WaitlistInput);
    await db
      .insert(schema.waitlistEntries)
      .values({
        email: input.email.toLowerCase(),
        company: input.company ?? null,
        role: input.role ?? null,
      })
      .onConflictDoNothing();
    await track(db, null, "waitlist_joined", {});
    // Same response whether or not the email already existed (no enumeration).
    return { ok: true };
  },
  { public: true, rateLimit: { key: "waitlist", max: 5, windowSeconds: 600 } },
);
