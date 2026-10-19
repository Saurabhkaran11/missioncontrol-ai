import { getDb } from "@/db/client";
import { currentContext } from "@/server/auth";
import { listLeads } from "@/server/services/leads";
import { roleCan } from "@/features/approval-policy";
import { LeadsTable } from "@/components/leads-table";
import { PageHeader } from "@/components/ui";

export default async function Leads({
  searchParams,
}: {
  searchParams: Promise<{ mission?: string }>;
}) {
  const { mission } = await searchParams;
  const auth = (await currentContext())!;
  const missionId =
    mission && /^[0-9a-f-]{36}$/i.test(mission) ? mission : undefined;
  const rows = await listLeads(await getDb(), auth.orgId, { missionId });
  return (
    <>
      <PageHeader
        title="Leads & deliverables"
        sub="Every company Leo considered — including rejections and duplicates, with the reason. Open a row for evidence, draft and review history."
      />
      <LeadsTable
        rows={JSON.parse(JSON.stringify(rows))}
        csvHref={`/api/v1/exports/leads.csv${missionId ? `?missionId=${missionId}` : ""}`}
        canEdit={roleCan(auth.role, "lead.edit")}
        canDecide={roleCan(auth.role, "approval.decide")}
      />
    </>
  );
}
