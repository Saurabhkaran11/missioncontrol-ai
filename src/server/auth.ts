import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, schema, type DB } from "@/db/client";
import { randomToken, sha256 } from "@/shared/crypto";
import { env } from "@/shared/env";
import type { Role } from "@/db/schema";

/**
 * Cookie sessions backed by the `sessions` table.
 * The browser holds a random 256-bit token (httpOnly, SameSite=Lax, Secure in
 * production); the DB stores only its SHA-256, so sessions are revocable and a
 * database leak cannot be replayed.
 */
export const SESSION_COOKIE = "mc_session";
const SESSION_DAYS = 7;

export type AuthContext = {
  userId: string;
  userName: string;
  userEmail: string;
  orgId: string;
  orgName: string;
  orgIsDemo: boolean;
  role: Role;
};

export async function createSession(db: DB, userId: string, orgId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db
    .insert(schema.sessions)
    .values({
      userId,
      tokenHash: sha256(token),
      activeOrganizationId: orgId,
      expiresAt,
    });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Resolves a raw token to the user + active org, re-checking membership every time. */
export async function contextFromToken(
  db: DB,
  token: string | undefined,
): Promise<AuthContext | null> {
  if (!token || token.length > 200) return null;
  const rows = await db
    .select({
      userId: schema.users.id,
      userName: schema.users.name,
      userEmail: schema.users.email,
      orgId: schema.organizations.id,
      orgName: schema.organizations.name,
      orgIsDemo: schema.organizations.isDemo,
      role: schema.organizationMemberships.role,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .innerJoin(
      schema.organizations,
      eq(schema.organizations.id, schema.sessions.activeOrganizationId),
    )
    .innerJoin(
      schema.organizationMemberships,
      and(
        eq(
          schema.organizationMemberships.organizationId,
          schema.organizations.id,
        ),
        eq(schema.organizationMemberships.userId, schema.users.id),
      ),
    )
    .where(
      and(
        eq(schema.sessions.tokenHash, sha256(token)),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function currentContext(): Promise<AuthContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return contextFromToken(await getDb(), token);
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db
      .delete(schema.sessions)
      .where(eq(schema.sessions.tokenHash, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}
