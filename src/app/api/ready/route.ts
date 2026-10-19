import { sql } from "drizzle-orm";
import { getDb, dbHandle } from "@/db/client";
import { queueStats } from "@/workers/queue";

// Readiness: database reachable and migrations applied, plus queue depth for
// operators. No hostnames, credentials or versions are exposed.
export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    const queue = await queueStats(db);
    return Response.json({ status: "ready", database: dbHandle().kind, queue });
  } catch {
    return Response.json({ status: "not_ready" }, { status: 503 });
  }
}
