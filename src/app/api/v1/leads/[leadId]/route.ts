import { body, route } from "@/server/api";
import { leadDetail, patchLead } from "@/server/services/leads";
import { LeadPatch } from "@/shared/schemas";

export const GET = route(async ({ db, auth, params }) =>
  leadDetail(db, auth.orgId, params.leadId),
);
export const PATCH = route(
  async ({ req, db, auth, params }) => ({
    lead: await patchLead(db, auth, params.leadId, await body(req, LeadPatch)),
  }),
  { perm: "lead.edit" },
);
