import { route } from "@/server/api";
import { testIntegration } from "@/server/services/integrations";

export const POST = route(
  async ({ db, auth, params }) => testIntegration(db, auth, params.provider),
  {
    perm: "integration.manage",
    rateLimit: { key: "integration.test", max: 20, windowSeconds: 600 },
  },
);
