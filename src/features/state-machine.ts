import type { MissionStatus, TaskStatus } from "@/db/schema";

/**
 * Allowed lifecycle transitions. Anything else is rejected, which keeps
 * pause/resume/cancel idempotent and stops e.g. a cancelled mission from
 * being restarted by a stale worker job.
 * Example: canMission("paused", "running") -> true; canMission("cancelled", "running") -> false
 */
const MISSION: Record<MissionStatus, MissionStatus[]> = {
  draft: ["queued", "cancelled"],
  queued: ["running", "paused", "cancelled", "failed"],
  running: [
    "paused",
    "needs_approval",
    "blocked",
    "succeeded",
    "failed",
    "cancelled",
  ],
  paused: ["running", "cancelled"],
  needs_approval: ["running", "paused", "blocked", "succeeded", "cancelled"],
  blocked: ["running", "cancelled", "failed"],
  succeeded: [],
  failed: ["queued"],
  cancelled: [],
};

const TASK: Record<TaskStatus, TaskStatus[]> = {
  pending: ["queued", "cancelled", "needs_approval"],
  queued: ["running", "cancelled"],
  running: [
    "succeeded",
    "failed",
    "retrying",
    "blocked",
    "waiting",
    "cancelled",
  ],
  retrying: ["queued", "running", "failed", "cancelled"],
  waiting: ["queued", "cancelled"],
  needs_approval: ["queued", "cancelled"],
  blocked: ["queued", "cancelled"],
  succeeded: [],
  failed: ["queued"],
  cancelled: [],
};

export const canMission = (from: MissionStatus, to: MissionStatus) =>
  from === to || MISSION[from].includes(to);
export const canTask = (from: TaskStatus, to: TaskStatus) =>
  from === to || TASK[from].includes(to);
export const TERMINAL_TASK: TaskStatus[] = ["succeeded", "failed", "cancelled"];
export const TERMINAL_MISSION: MissionStatus[] = [
  "succeeded",
  "failed",
  "cancelled",
];

/**
 * Bounded exponential backoff with optional jitter.
 * Example: backoffMs(1) = 2000, backoffMs(2) = 4000, backoffMs(10) = 60000 (cap).
 */
export function backoffMs(
  attempt: number,
  opts: { baseMs?: number; capMs?: number; jitter?: () => number } = {},
) {
  const base = opts.baseMs ?? 1000;
  const cap = opts.capMs ?? 60_000;
  const raw = Math.min(cap, base * 2 ** attempt);
  const j = opts.jitter ? opts.jitter() : 0; // 0..1
  return Math.round(raw * (1 - 0.2 * j));
}

/** Topological readiness: tasks whose dependencies have all succeeded. */
export function readyTasks<T extends { id: string; status: TaskStatus }>(
  tasks: T[],
  deps: { taskId: string; dependsOnTaskId: string }[],
): T[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return tasks.filter(
    (t) =>
      t.status === "pending" &&
      deps
        .filter((d) => d.taskId === t.id)
        .every((d) => byId.get(d.dependsOnTaskId)?.status === "succeeded"),
  );
}

/** Throws if the dependency graph has a cycle (defensive check on dynamic DAG edits). */
export function assertAcyclic(
  nodes: string[],
  edges: { taskId: string; dependsOnTaskId: string }[],
) {
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (n: string) => {
    if (state.get(n) === 1) throw new Error(`Task graph cycle at ${n}`);
    if (state.get(n) === 2) return;
    state.set(n, 1);
    edges
      .filter((e) => e.taskId === n)
      .forEach((e) => visit(e.dependsOnTaskId));
    state.set(n, 2);
  };
  nodes.forEach(visit);
}
