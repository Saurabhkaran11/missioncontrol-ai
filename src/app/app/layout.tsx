import { and, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db/client";
import { currentContext } from "@/server/auth";
import { AppNav } from "@/components/app-nav";
import { LogoutButton } from "@/components/client-actions";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await currentContext();
  if (!auth) redirect("/signin");
  const db = await getDb();
  const [pending] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.approvalRequests)
    .where(
      and(
        eq(schema.approvalRequests.organizationId, auth.orgId),
        eq(schema.approvalRequests.status, "pending"),
      ),
    );
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-surface p-4 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
        <Link href="/app" aria-label="Mission Control home">
          <Logo />
        </Link>
        <div className="mb-4 mt-4 rounded-lg bg-surface-2 px-3 py-2">
          <div className="truncate text-sm font-medium" title={auth.orgName}>
            {auth.orgName}
          </div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {auth.userName} · {auth.role}
            </span>
            <LogoutButton />
          </div>
        </div>
        <AppNav pendingApprovals={pending?.n ?? 0} />
      </aside>
      <div className="min-w-0">
        {auth.orgIsDemo && (
          <div
            role="note"
            className="flex flex-wrap items-center gap-2 border-b border-[#e8d48a] bg-[#fff7d6] px-6 py-2 text-xs text-[#6b5200]"
          >
            <Badge tone="sample">Sample workspace</Badge>
            All companies, sources and the founder are fictional (.example
            domains). Integrations are mock/demo and labelled. Nothing is sent
            anywhere.
          </div>
        )}
        <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
