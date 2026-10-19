import { and, desc, eq } from "drizzle-orm";
import { schema, type DB } from "@/db/client";
import { ensureAgentProfiles, seedOrganization, demoSlug } from "@/db/seed";
import type { AuthContext } from "@/server/auth";
import { audit, track } from "@/server/audit";
import { randomToken, sha256 } from "@/shared/crypto";
import { conflict, forbidden } from "@/shared/errors";
import { roleCan } from "@/features/approval-policy";

/** Organization, onboarding, team and data-rights operations. */

export async function createDemoWorkspace(db: DB) {
  const slug = demoSlug();
  const res = await seedOrganization(db, {
    slug,
    orgName: "Northwind Assist — sample workspace",
    owner: {
      email: `visitor+${slug}@demo.missioncontrol.example`,
      name: "Demo visitor",
    },
  });
  await track(db, res.orgId, "demo_workspace_created", {});
  return res;
}

/**
 * Local development sign-in (DEMO_MODE only; the route refuses it otherwise).
 * Creates the user and a personal workspace on first use.
 */
export async function devLogin(db: DB, email: string, name: string) {
  const normalized = email.trim().toLowerCase();
  let [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalized));
  if (!user)
    [user] = await db
      .insert(schema.users)
      .values({ email: normalized, name, authProvider: "local-dev" })
      .returning();
  const [membership] = await db
    .select()
    .from(schema.organizationMemberships)
    .where(eq(schema.organizationMemberships.userId, user.id))
    .orderBy(desc(schema.organizationMemberships.createdAt))
    .limit(1);
  if (membership)
    return { userId: user.id, orgId: membership.organizationId, isNew: false };
  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: `${name}'s workspace`,
      slug: `ws-${randomToken(6)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")}`,
    })
    .returning();
  await db
    .insert(schema.organizationMemberships)
    .values({ organizationId: org.id, userId: user.id, role: "owner" });
  await ensureAgentProfiles(db, org.id);
  await track(db, org.id, "signup", { method: "local-dev" });
  return { userId: user.id, orgId: org.id, isNew: true };
}

export async function getProfile(db: DB, orgId: string) {
  const [p] = await db
    .select()
    .from(schema.workspaceProfiles)
    .where(eq(schema.workspaceProfiles.organizationId, orgId));
  return p ?? null;
}

export async function saveOnboarding(
  db: DB,
  auth: AuthContext,
  input: {
    companyName: string;
    productDescription: string;
    icp: string;
    geography: string;
    exclusions: string[];
    tone: string;
    desiredOutput: string;
  },
) {
  if (!roleCan(auth.role, "settings.manage")) throw forbidden();
  await db
    .insert(schema.workspaceProfiles)
    .values({ organizationId: auth.orgId, ...input })
    .onConflictDoUpdate({
      target: schema.workspaceProfiles.organizationId,
      set: { ...input, updatedAt: new Date() },
    });
  await audit(db, {
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "workspace.profile_update",
  });
  await track(db, auth.orgId, "onboarding_completed", {});
}

export async function members(db: DB, orgId: string) {
  const list = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.organizationMemberships.role,
      since: schema.organizationMemberships.createdAt,
    })
    .from(schema.organizationMemberships)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.organizationMemberships.userId),
    )
    .where(eq(schema.organizationMemberships.organizationId, orgId));
  const invites = await db
    .select({
      id: schema.invitations.id,
      email: schema.invitations.email,
      role: schema.invitations.role,
      expiresAt: schema.invitations.expiresAt,
      acceptedAt: schema.invitations.acceptedAt,
    })
    .from(schema.invitations)
    .where(eq(schema.invitations.organizationId, orgId));
  return { members: list, invites };
}

/** Creates an invite link. No email is sent — the admin shares the link. */
export async function invite(
  db: DB,
  auth: AuthContext,
  email: string,
  role: "admin" | "member",
) {
  if (!roleCan(auth.role, "members.manage")) throw forbidden();
  const token = randomToken();
  await db
    .insert(schema.invitations)
    .values({
      organizationId: auth.orgId,
      email: email.toLowerCase(),
      role,
      tokenHash: sha256(token),
      invitedBy: auth.userId,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    });
  await audit(db, {
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "member.invite",
    metadata: { role },
  });
  return { inviteToken: token };
}

export async function acceptInvite(db: DB, token: string, userId: string) {
  const [inv] = await db
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.tokenHash, sha256(token)));
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date())
    throw conflict("invalid_invite", "Invite is invalid or expired");
  await db
    .insert(schema.organizationMemberships)
    .values({ organizationId: inv.organizationId, userId, role: inv.role })
    .onConflictDoNothing();
  await db
    .update(schema.invitations)
    .set({ acceptedAt: new Date() })
    .where(eq(schema.invitations.id, inv.id));
  return inv.organizationId;
}

/** Tenant data export (data portability). Excludes credentials and session data. */
export async function exportOrgData(db: DB, auth: AuthContext) {
  if (!roleCan(auth.role, "settings.manage")) throw forbidden();
  const org = auth.orgId;
  const [missions, leads, evidence, drafts, reviews, approvals, decisions] =
    await Promise.all([
      db
        .select()
        .from(schema.missions)
        .where(eq(schema.missions.organizationId, org)),
      db
        .select()
        .from(schema.leads)
        .where(eq(schema.leads.organizationId, org)),
      db
        .select()
        .from(schema.evidenceSources)
        .where(eq(schema.evidenceSources.organizationId, org)),
      db
        .select()
        .from(schema.outreachDrafts)
        .where(eq(schema.outreachDrafts.organizationId, org)),
      db
        .select()
        .from(schema.reviewFindings)
        .where(eq(schema.reviewFindings.organizationId, org)),
      db
        .select()
        .from(schema.approvalRequests)
        .where(eq(schema.approvalRequests.organizationId, org)),
      db
        .select()
        .from(schema.approvalDecisions)
        .where(eq(schema.approvalDecisions.organizationId, org)),
    ]);
  await audit(db, {
    orgId: org,
    actorType: "user",
    actorId: auth.userId,
    action: "data.export",
  });
  return {
    exportedAt: new Date().toISOString(),
    organization: { id: org, name: auth.orgName },
    missions,
    leads,
    evidence,
    drafts,
    reviews,
    approvals,
    decisions,
  };
}

/** Owner-only: deletes the organization and (via cascades) all tenant data. */
export async function deleteOrganization(
  db: DB,
  auth: AuthContext,
  confirmName: string,
) {
  if (!roleCan(auth.role, "data.delete"))
    throw forbidden("Only the owner can delete the workspace");
  if (confirmName !== auth.orgName)
    throw conflict(
      "confirmation_mismatch",
      "Type the workspace name exactly to confirm",
    );
  await audit(db, {
    orgId: null,
    actorType: "user",
    actorId: auth.userId,
    action: "org.delete",
    targetType: "organization",
    targetId: auth.orgId,
  });
  await db
    .delete(schema.organizations)
    .where(and(eq(schema.organizations.id, auth.orgId)));
}
