import { Worker } from "node:worker_threads";
import type { Health, SandboxProvider, SandboxResult } from "../types";

/**
 * Local-safe demo sandbox.
 *
 * Only programs in REVIEWED_PROGRAMS can run — callers pass a program id, never
 * code — so no user or model text is ever executed. Each run happens in a
 * worker thread with an empty environment (no app secrets), a 32 MB heap cap
 * and a 2 s wall-clock limit.
 *
 * This is NOT a security boundary for untrusted code: worker threads share the
 * host process. Arbitrary code execution requires a real isolated sandbox
 * (e.g. Tenki), which is reported as "not configured" until set up.
 *
 * Example: runReviewed("score-stats", { scores: [82, 64, 40] })
 *   -> { count: 3, mean: 62, median: 64, buckets: { "80-100": 1, "60-79": 1, "40-59": 1, "0-39": 0 } }
 */
export const REVIEWED_PROGRAMS: Record<string, string> = {
  "score-stats": `
    const s = (input.scores || []).filter(n => typeof n === "number").sort((a, b) => a - b);
    const mean = s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : 0;
    const median = s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
    const buckets = { "80-100": 0, "60-79": 0, "40-59": 0, "0-39": 0 };
    for (const n of s) buckets[n >= 80 ? "80-100" : n >= 60 ? "60-79" : n >= 40 ? "40-59" : "0-39"]++;
    return { count: s.length, mean, median, buckets };
  `,
  "payload-shape-check": `
    const required = ["company", "score", "rationale", "sources"];
    const rows = input.rows || [];
    return rows.map(r => ({ id: r.id, missing: required.filter(k => r[k] === undefined || r[k] === null || r[k] === "") }));
  `,
};

const WORKER_SOURCE = `
  const { parentPort, workerData } = require("node:worker_threads");
  const fn = new Function("input", workerData.code);
  parentPort.postMessage(fn(workerData.input));
`;

export class DemoSandboxProvider implements SandboxProvider {
  readonly id = "local-reviewed-sandbox";
  readonly mode = "demo" as const;

  async health(): Promise<Health> {
    return {
      status: "mock",
      message:
        "Local demo: runs only fixed, reviewed programs in a resource-limited worker thread. Not an isolation boundary.",
      checkedAt: new Date(),
    };
  }

  runReviewed(programId: string, input: unknown): Promise<SandboxResult> {
    const code = REVIEWED_PROGRAMS[programId];
    if (!code)
      return Promise.reject(
        new Error(
          `Unknown sandbox program "${programId}" (only reviewed programs may run)`,
        ),
      );
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: { code, input: JSON.parse(JSON.stringify(input ?? {})) },
        env: {},
        resourceLimits: {
          maxOldGenerationSizeMb: 32,
          maxYoungGenerationSizeMb: 8,
          stackSizeMb: 4,
        },
      });
      const timer = setTimeout(() => {
        void worker.terminate();
        reject(new Error(`Sandbox program "${programId}" exceeded 2000ms`));
      }, 2000);
      worker.once("message", (output) => {
        clearTimeout(timer);
        void worker.terminate();
        const text = JSON.stringify(output);
        if (text.length > 20_000)
          return reject(new Error("Sandbox output exceeded 20KB"));
        resolve({
          programId,
          output,
          durationMs: Date.now() - started,
          isolation: "worker_thread (demo, reviewed programs only)",
        });
      });
      worker.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }
}

/** Reported when SANDBOX_PROVIDER=disabled or tenki is selected but not wired. */
export class UnavailableSandbox implements SandboxProvider {
  readonly mode = "live" as const;
  constructor(
    readonly id: string,
    private reason: string,
  ) {}
  async health(): Promise<Health> {
    return {
      status: "not_configured",
      message: this.reason,
      checkedAt: new Date(),
    };
  }
  async runReviewed(): Promise<SandboxResult> {
    throw new Error(`Sandbox unavailable: ${this.reason}`);
  }
}
