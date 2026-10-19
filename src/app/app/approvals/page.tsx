import { getDb } from "@/db/client";
import { currentContext } from "@/server/auth";
import { listApprovals } from "@/server/services/leads";
import { roleCan } from "@/features/approval-policy";
import { ApprovalsInbox } from "@/components/approvals-inbox";
import { PageHeader } from "@/components/ui";

export default async function Approvals({
  searchParams,
}: {
  searchParams: Promise<{ mission?: string }>;
}) {
  const { mission } = await searchParams;
  const auth = (await currentContext())!;
  const rows = await listApprovals(await getDb(), auth.orgId, "pending");
  const items = rows.filter(
    (r) => !mission || r.approval.missionId === mission,
  );
  return (
    <>
      <PageHeader
        title="Approvals"
        sub="Review the lead, its evidence, the draft and Sam's findings side by side. You approve one exact payload version; any later edit requires a new approval."
      />
      <ApprovalsInbox
        items={JSON.parse(JSON.stringify(items))}
        canDecide={roleCan(auth.role, "approval.decide")}
        canEdit={roleCan(auth.role, "lead.edit")}
      />
    </>
  );
}
