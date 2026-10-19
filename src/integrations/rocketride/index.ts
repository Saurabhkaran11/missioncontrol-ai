import fs from "node:fs";
import crypto from "node:crypto";
import type { AgentOrchestrator, Health, TaskEnvelope } from "../types";

/**
 * Agent orchestration.
 *
 * MissionControl owns the task graph, typed artifacts, retries and approval
 * policy. An orchestrator decides *where* each task executes.
 *
 * LocalDemoOrchestrator — runs the domain handler in-process. Labelled demo.
 *
 * RocketRideOrchestrator — uses the official `rocketride` TypeScript SDK
 * (verified: RocketRideClient, connect, use, send, getTaskStatus, terminate,
 * ping, getServices). Each task envelope is sent to the configured pipeline
 * (ROCKETRIDE_PIPELINE_FILE) under an unguessable `tk_` token, and the run id
 * is recorded on the task. The typed artifact is still produced and validated
 * by MissionControl domain code, so a pipeline that returns malformed data
 * cannot corrupt leads or bypass approvals. If RocketRide is selected but
 * fails, the task fails (and retries) — it never silently falls back to demo.
 */
export class LocalDemoOrchestrator implements AgentOrchestrator {
  readonly id = "local-demo";
  readonly mode = "demo" as const;
  async health(): Promise<Health> {
    return {
      status: "mock",
      message:
        "Deterministic local orchestrator (demo). Tasks run in the MissionControl worker.",
      checkedAt: new Date(),
    };
  }
  async capabilities() {
    return ["task-graph", "pause", "resume", "cancel", "retry"];
  }
  async run(
    _task: TaskEnvelope,
    execLocal: () => Promise<Record<string, unknown>>,
  ) {
    return { output: await execLocal(), externalRunId: null };
  }
}

type RRClient = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<void>;
  getServices(): Promise<unknown>;
  use(opts: Record<string, unknown>): Promise<{ token: string }>;
  send(
    token: string,
    data: string,
    objinfo?: Record<string, unknown>,
    mimetype?: string,
  ): Promise<unknown>;
  terminate(token: string): Promise<void>;
};

export class RocketRideOrchestrator implements AgentOrchestrator {
  readonly id = "rocketride";
  readonly mode = "live" as const;
  constructor(
    private opts: { apiKey: string; uri: string; pipelineFile: string },
  ) {}

  private async withClient<T>(fn: (c: RRClient) => Promise<T>): Promise<T> {
    const { RocketRideClient } = (await import("rocketride")) as unknown as {
      RocketRideClient: new (cfg: { auth: string; uri: string }) => RRClient;
    };
    const client = new RocketRideClient({
      auth: this.opts.apiKey,
      uri: this.opts.uri,
    });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  async health(): Promise<Health> {
    try {
      await this.withClient((c) => c.ping());
      return {
        status: "connected",
        message: "RocketRide ping OK.",
        checkedAt: new Date(),
      };
    } catch (e) {
      return {
        status: "error",
        message:
          e instanceof Error
            ? e.message.slice(0, 200)
            : "RocketRide unreachable",
        checkedAt: new Date(),
      };
    }
  }

  async capabilities() {
    const services = await this.withClient((c) => c.getServices());
    return Array.isArray(services)
      ? services.map(String).slice(0, 50)
      : Object.keys((services as object) ?? {}).slice(0, 50);
  }

  async run(
    task: TaskEnvelope,
    execLocal: () => Promise<Record<string, unknown>>,
  ) {
    const pipeline = JSON.parse(
      fs.readFileSync(this.opts.pipelineFile, "utf8"),
    );
    const token = `tk_${crypto.randomUUID()}`;
    const remote = await this.withClient(async (c) => {
      await c.use({ pipeline, token, ttl: 900 });
      try {
        // Only structured task context is sent — no secrets, no raw pages.
        return await c.send(
          token,
          JSON.stringify({
            taskType: task.taskType,
            agent: task.agentSlug,
            missionId: task.missionId,
            idempotencyKey: task.idempotencyKey,
          }),
          { name: "task.json" },
          "application/json",
        );
      } finally {
        await c.terminate(token).catch(() => undefined);
      }
    });
    const output = await execLocal();
    return {
      output: {
        ...output,
        rocketride: {
          runToken: token.slice(0, 12) + "…",
          resultPreview: JSON.stringify(remote ?? null).slice(0, 200),
        },
      },
      externalRunId: token,
    };
  }
}
