import { body, route } from "@/server/api";
import { invite } from "@/server/services/org";
import { InviteInput } from "@/shared/schemas";
import { env } from "@/shared/env";

export const POST = route(
  async ({ req, db, auth }) => {
    const input = await body(req, InviteInput);
    const { inviteToken } = await invite(db, auth, input.email, input.role);
    // The link is shown once to the admin; only its hash is stored.
    return { inviteUrl: `${env().NEXT_PUBLIC_APP_URL}/invite/${inviteToken}` };
  },
  { perm: "members.manage" },
);
