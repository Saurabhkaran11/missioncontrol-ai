import { getDb } from "@/db/client";
import { env } from "@/shared/env";
import { startWorker } from "@/workers/worker";

async function main() {
  // Standalone durable worker: `npm run worker` (requires DATABASE_URL for multi-process use).

  const db = await getDb();
  const w = startWorker(db, { concurrency: env().WORKER_CONCURRENCY });
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { w.stop(); setTimeout(() => process.exit(0), 1000); });

}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
