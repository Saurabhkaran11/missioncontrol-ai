import { route } from "@/server/api";
import { listIntegrations } from "@/server/services/integrations";

export const GET = route(async ({ db, auth }) => ({
  integrations: await listIntegrations(db, auth.orgId),
}));
