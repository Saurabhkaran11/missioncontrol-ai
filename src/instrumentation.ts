/**
 * Runs once per server start. In the zero-setup demo (no DATABASE_URL) the
 * embedded PGlite database is single-process, so the durable worker runs
 * inside the web process. With DATABASE_URL set, run `npm run worker` as a
 * separate service instead (set EMBEDDED_WORKER=true to force embedding).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("@/shared/env");
  const e = env(); // fail fast on invalid configuration
  const embedded = e.EMBEDDED_WORKER
    ? e.EMBEDDED_WORKER === "true"
    : !e.DATABASE_URL;
  const { getDb } = await import("@/db/client");
  const db = await getDb();
  if (embedded) {
    const { startWorker } = await import("@/workers/worker");
    const g = globalThis as unknown as { __mcWorker?: unknown };
    if (!g.__mcWorker)
      g.__mcWorker = startWorker(db, { concurrency: e.WORKER_CONCURRENCY });
  }
}
