import { getDb } from "@/db/client";
import { currentContext } from "@/server/auth";
import { listIntegrations } from "@/server/services/integrations";
import { roleCan } from "@/features/approval-policy";
import { env } from "@/shared/env";
import { IntegrationsPanel } from "@/components/integrations-panel";
import { PageHeader } from "@/components/ui";

export default async function Integrations() {
  const auth = (await currentContext())!;
  const items = await listIntegrations(await getDb(), auth.orgId);
  return (
    <>
      <PageHeader
        title="Integrations"
        sub="Every connection shows what it can do and its real status: connected, not configured, mock/demo, degraded or error. Tests are read-only health checks."
      />
      <IntegrationsPanel
        initial={items}
        canManage={roleCan(auth.role, "integration.manage")}
        liveWritesEnabled={env().LIVE_EXTERNAL_ACTIONS_ENABLED}
        encryptionReady={Boolean(env().INTEGRATION_ENCRYPTION_KEY)}
      />
    </>
  );
}
