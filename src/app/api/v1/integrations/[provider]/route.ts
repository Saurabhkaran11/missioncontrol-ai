import { body, route } from "@/server/api";
import { updateN8n } from "@/server/services/integrations";
import { IntegrationUpdate } from "@/shared/schemas";
import { AppError } from "@/shared/errors";

// Only n8n is configurable per workspace; other providers are operator-level env config.
export const PUT = route(
  async ({ req, db, auth, params }) => {
    if (params.provider !== "n8n")
      throw new AppError(
        "not_configurable",
        "This provider is configured by the operator via environment variables",
        400,
      );
    return updateN8n(db, auth, await body(req, IntegrationUpdate));
  },
  { perm: "integration.manage" },
);
