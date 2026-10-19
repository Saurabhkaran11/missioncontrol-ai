import { and, eq, sql } from "drizzle-orm";
import { schema, type DB } from "@/db/client";
import { backoffMs } from "@/features/state-machine";

/**
 * Durable PostgreSQL job queue.
 *
 * Workers claim jobs with `FOR UPDATE SKIP LOCKED`, so several worker
 * processes can poll the same table without double-processing. Jobs survive
 * restarts; a job locked by a crashed worker is reclaimed after LOCK_TIMEOUT.
 * Failures retry with bounded exponential backoff, then move to `dead`
 * (dead-letter) for human attention.
 *
 * Example: enqueue(db, "task.run", { taskId }, { dedupeKey: `task:${taskId}:1` })
 */
export type JobKind = "task.run";
const LOCK_TIMEOUT_SECONDS = 300;

export async function enqueue(
  db: DB | Parameters<Parameters<DB["transaction"]>[0]>[0],
  kind: JobKind,
  payload: Record<string, unknown>,
  opts: {
    orgId?: string;
    dedupeKey?: string;
    runAt?: Date;
    maxAttempts?: number;
  } = {},
) {
  await db
    .insert(schema.jobs)
    .values({
      kind,
      payload,
      organizationId: opts.orgId ?? null,
      dedupeKey: opts.dedupeKey ?? null,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 3,
    })
    .onConflictDoNothing();
}

export type ClaimedJob = typeof schema.jobs.$inferSelect;

export async function claim(
  db: DB,
  workerId: string,
  limit = 1,
): Promise<ClaimedJob[]> {
  const res = await db.execute(sql`
    UPDATE jobs SET status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1, updated_at = now()
    WHERE id IN (
      SELECT id FROM jobs
      WHERE (status = 'queued' AND run_at <= now())
         OR (status = 'running' AND locked_at < now() - make_interval(secs => ${LOCK_TIMEOUT_SECONDS}))
      ORDER BY run_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`);
  const ids = (res as unknown as { rows: { id: string }[] }).rows.map(
    (r) => r.id,
  );
  if (!ids.length) return [];
  return db
    .select()
    .from(schema.jobs)
    .where(
      sql`${schema.jobs.id} IN (${sql.join(
        ids.map((i) => sql`${i}`),
        sql`, `,
      )})`,
    );
}

export async function complete(db: DB, id: string) {
  await db
    .update(schema.jobs)
    .set({ status: "succeeded", lockedAt: null, updatedAt: new Date() })
    .where(eq(schema.jobs.id, id));
}

/** Returns "retry" when the job was rescheduled, "dead" when it exhausted attempts. */
export async function fail(
  db: DB,
  job: ClaimedJob,
  err: unknown,
  retryable: boolean,
): Promise<"retry" | "dead"> {
  const message = (err instanceof Error ? err.message : String(err)).slice(
    0,
    500,
  );
  if (retryable && job.attempts < job.maxAttempts) {
    await db
      .update(schema.jobs)
      .set({
        status: "queued",
        lockedAt: null,
        lastError: message,
        runAt: new Date(
          Date.now() + backoffMs(job.attempts, { jitter: Math.random }),
        ),
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id));
    return "retry";
  }
  await db
    .update(schema.jobs)
    .set({
      status: "dead",
      lockedAt: null,
      lastError: message,
      updatedAt: new Date(),
    })
    .where(eq(schema.jobs.id, job.id));
  return "dead";
}

export async function queueStats(db: DB) {
  const res = await db.execute(
    sql`SELECT status, count(*)::int AS n FROM jobs GROUP BY status`,
  );
  return Object.fromEntries(
    (res as unknown as { rows: { status: string; n: number }[] }).rows.map(
      (r) => [r.status, r.n],
    ),
  );
}

export async function pendingJobsFor(db: DB, taskId: string) {
  return db
    .select()
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.status, "queued"),
        sql`${schema.jobs.payload}->>'taskId' = ${taskId}`,
      ),
    );
}
