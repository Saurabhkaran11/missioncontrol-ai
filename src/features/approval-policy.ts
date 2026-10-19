import { payloadHash } from "@/shared/crypto";
import type { Lead, Draft, Evidence, ApprovalRequest, Role } from "@/db/schema";

/**
 * Approval policy: every external write must be backed by a human approval of
 * the *exact* payload being sent.
 *
 * Example: Alex snapshots lead v1 + draft v2 -> hash H1 and opens a request.
 * You approve H1. Someone then edits the draft (v3). The export recomputes the
 * payload -> hash H2 ≠ H1, so `checkExportable` returns "stale" and nothing is
 * sent until a fresh approval of H2 exists.
 */
export const EXPORT_DESTINATION = "n8n:leads_webhook";

export type ApprovalPayload = {
  leadId: string;
  leadVersion: number;
  company: string;
  domain: string | null;
  score: number;
  rationale: string;
  location: string | null;
  sources: { url: string; title: string }[];
  draft: { id: string; version: number; subject: string; body: string } | null;
  destination: string;
};

export function buildApprovalPayload(
  lead: Lead,
  draft: Draft | null,
  evidence: Pick<Evidence, "url" | "title">[],
): ApprovalPayload {
  return {
    leadId: lead.id,
    leadVersion: lead.version,
    company: lead.companyName,
    domain: lead.domain,
    score: lead.score,
    rationale: lead.rationale,
    location: lead.location,
    sources: evidence
      .map((e) => ({ url: e.url, title: e.title }))
      .sort((a, b) => a.url.localeCompare(b.url)),
    draft: draft
      ? {
          id: draft.id,
          version: draft.version,
          subject: draft.subject,
          body: draft.body,
        }
      : null,
    destination: EXPORT_DESTINATION,
  };
}

export const hashApprovalPayload = (p: ApprovalPayload) => payloadHash(p);

export type ExportCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "not_approved" | "stale" | "rejected" | "wrong_destination";
      message: string;
    };

export function checkExportable(
  approval: Pick<ApprovalRequest, "status" | "payloadHash" | "destination">,
  currentHash: string,
): ExportCheck {
  if (approval.destination !== EXPORT_DESTINATION)
    return {
      ok: false,
      reason: "wrong_destination",
      message: "Approval was for a different destination",
    };
  if (approval.status === "rejected")
    return { ok: false, reason: "rejected", message: "This item was rejected" };
  if (approval.status !== "approved")
    return {
      ok: false,
      reason: "not_approved",
      message: "Awaiting human approval",
    };
  if (approval.payloadHash !== currentHash)
    return {
      ok: false,
      reason: "stale",
      message: "Lead or draft changed after approval — re-approval required",
    };
  return { ok: true };
}

/** Role-based permissions, checked server-side on every request. */
export type Permission =
  | "mission.read"
  | "mission.write"
  | "lead.edit"
  | "approval.decide"
  | "export.run"
  | "integration.manage"
  | "settings.manage"
  | "members.manage"
  | "data.delete";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    "mission.read",
    "mission.write",
    "lead.edit",
    "approval.decide",
    "export.run",
    "integration.manage",
    "settings.manage",
    "members.manage",
    "data.delete",
  ],
  admin: [
    "mission.read",
    "mission.write",
    "lead.edit",
    "approval.decide",
    "export.run",
    "integration.manage",
    "settings.manage",
    "members.manage",
  ],
  member: ["mission.read", "mission.write", "lead.edit"],
};

export const roleCan = (role: Role, perm: Permission) =>
  ROLE_PERMISSIONS[role].includes(perm);
