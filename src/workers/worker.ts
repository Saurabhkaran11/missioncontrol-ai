import os from "node:os";
import type { DB } from "@/db/client";
import { log } from "@/shared/logger";
import { claim, complete, fail } from "./queue";
import { runTask } from "./engine";

/**
 * Polling worker. Run standalone (`npm run worker`) next to a Postgres
 * DATABASE_URL, or embedded in the web process for the zero-setup PGlite demo.
 * Example: startWorker(db, { concurrency: 2 }) -> { stop() }
 */
export function startWorker(
  db: DB,
  opts: { concurrency: number; pollMs?: number; id?: string },
) {
  const workerId = opts.id ?? `${os.hostname()}:${process.pid}`;
  let stopped = false;
  let active = 0;
  const health = {
    startedAt: new Date(),
    processed: 0,
    failed: 0,
    lastTickAt: new Date(),
  };

  const tick = async () => {
    if (stopped) return;
    health.lastTickAt = new Date();
    try {
      const free = opts.concurrency - active;
      if (free > 0) {
        const jobs = await claim(db, workerId, free);
        for (const job of jobs) {
          active++;
          void (async () => {
            try {
              if (job.kind === "task.run")
                await runTask(db, String(job.payload.taskId));
              await complete(db, job.id);
              health.processed++;
            } catch (err) {
              health.failed++;
              const retryable = Boolean(
                (err as { retryable?: boolean }).retryable,
              );
              const outcome = await fail(db, job, err, retryable);
              log.warn("job.failed", {
                jobId: job.id,
                kind: job.kind,
                outcome,
              });
            } finally {
              active--;
            }
          })();
        }
      }
    } catch (err) {
      log.error("worker.tick_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (!stopped) setTimeout(tick, opts.pollMs ?? 500);
  };
  void tick();
  log.info("worker.started", { workerId, concurrency: opts.concurrency });
  return {
    health,
    stop: () => {
      stopped = true;
    },
  };
}
