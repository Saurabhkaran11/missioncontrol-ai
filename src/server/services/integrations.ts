import { and, desc, eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { schema, type DB } from "@/db/client";
import type { IntegrationStatus, Provider } from "@/db/schema";
import { providers } from "@/integrations";
import { MockLeadSink, N8nWebhookSink } from "@/integrations/n8n";
import type { LeadSinkProvider } from "@/integrations/types";
import { assertSafeUrlSyntax } from "@/integrations/research/ssrf";
import type { AuthContext } from "@/server/auth";
import { audit } from "@/server/audit";
import { decryptSecret, encryptSecret } from "@/shared/crypto";
import { env } from "@/shared/env";
import { AppError, notFound } from "@/shared/errors";

/**
 * Integration status and setup. Statuses are always computed from a real
 * check or explicit configuration — never hard-coded "connected".
 * Credentials are AES-GCM encrypted at rest and never returned by any API:
 * the view model only exposes `hasSecret: true/false`.
 */
export type IntegrationView = {
  provider: Provider;
  name: string;
  grants: string;
  status: IntegrationStatus;
  message: string;
  checkedAt: string | null;
  mode: "demo" | "live" | "ci";
  config: Record<string, string>;
  hasSecret: boolean;
  canConfigure: boolean;
  docs: string;
};

const META: Record<
  Exclude<Provider, "llm">,
  { name: string; grants: string; docs: string }
> = {
  rocketride: {
    name: "RocketRide",
    grants:
      "Executes mission tasks on a RocketRide pipeline. Receives task type and ids only — no secrets or raw pages.",
    docs: "docs/integrations.md#rocketride",
  },
  masky: {
    name: "Masky.AI",
    grants:
      "Read-only: fetches avatar images for the six synthetic agents. No voice cloning; audio is opt-in.",
    docs: "docs/integrations.md#maskyai",
  },
  n8n: {
    name: "n8n",
    grants:
      "Write: receives one human-approved lead + draft per call. Disabled until configured, tested and LIVE_EXTERNAL_ACTIONS_ENABLED=true.",
    docs: "docs/integrations.md#n8n",
  },
  research: {
    name: "Web research",
    grants:
      "Read-only: fetches public pages for domains you list. SSRF-guarded, no logins, no JavaScript.",
    docs: "docs/integrations.md#web-research",
  },
  sandbox: {
    name: "Code sandbox",
    grants:
      "Runs fixed, reviewed analysis programs. No secrets, no arbitrary code.",
    docs: "docs/integrations.md#sandbox",
  },
  snyk: {
    name: "Snyk",
    grants:
      "CI only: scans dependencies, source, container and IaC. Token lives in CI secrets, never in the app.",
    docs: "docs/security.md#snyk",
  },
};

async function saved(db: DB, orgId: string, provider: Provider) {
  const [row] = await db
    .select()
    .from(schema.integrationConnections)
    .where(
      and(
        eq(schema.integrationConnections.organizationId, orgId),
        eq(schema.integrationConnections.provider, provider),
      ),
    );
  return row ?? null;
}

/** Latest Snyk result written by CI (scripts/security-scan.sh); absent locally until a scan runs. */
function snykStatus(): {
  status: IntegrationStatus;
  message: string;
  checkedAt: string | null;
} {
  const file = path.join(
    process.cwd(),
    "security-reports",
    "snyk-summary.json",
  );
  try {
    const s = JSON.parse(fs.readFileSync(file, "utf8")) as {
      ranAt: string;
      results: Record<string, { exitCode: number; summary: string }>;
    };
    // A scan that could not run because the feature is off (e.g. Snyk Code
    // not enabled) is a coverage gap, not a failure: shown as degraded.
    const results = Object.values(s.results);
    const failed = results.filter(
      (r) => r.exitCode === 2 && !/not enabled/i.test(r.summary),
    );
    const status: IntegrationStatus = results.every((r) => r.exitCode === 0)
      ? "connected"
      : failed.length
        ? "error"
        : "degraded";
    return {
      status,
      message: Object.entries(s.results)
        .map(([k, v]) => `${k}: ${v.summary}`)
        .join(" · "),
      checkedAt: s.ranAt,
    };
  } catch {
    return {
      status: "not_configured",
      message:
        "No scan artifact found. Runs in CI (.github/workflows/security.yml) or `npm run security:snyk` with SNYK_TOKEN set.",
      checkedAt: null,
    };
  }
}

export async function listIntegrations(
  db: DB,
  orgId: string,
): Promise<IntegrationView[]> {
  const p = providers();
  const out: IntegrationView[] = [];
  const add = async (
    provider: Exclude<Provider, "llm">,
    health: {
      status: IntegrationStatus;
      message: string;
      checkedAt: Date | string | null;
    },
    mode: IntegrationView["mode"],
    canConfigure = false,
  ) => {
    const row = await saved(db, orgId, provider);
    out.push({
      provider,
      ...META[provider],
      status: row?.lastHealthCheckAt ? row.status : health.status,
      message: row?.lastHealthMessage ?? health.message,
      checkedAt:
        (row?.lastHealthCheckAt ?? health.checkedAt)
          ? new Date(row?.lastHealthCheckAt ?? health.checkedAt!).toISOString()
          : null,
      mode,
      config: row?.config ?? {},
      hasSecret: Boolean(row?.secretCiphertext),
      canConfigure,
    });
  };
  // Live providers get a real health check on every view; demo ones say so.
  const demo = (message: string) => ({
    status: "mock" as IntegrationStatus,
    message,
    checkedAt: null,
  });
  await add(
    "rocketride",
    p.orchestrator.mode === "demo"
      ? demo(
          "Using the local demo orchestrator. Set ORCHESTRATOR_PROVIDER=rocketride with ROCKETRIDE_* to enable.",
        )
      : await p.orchestrator.health(),
    p.orchestrator.mode,
  );
  await add(
    "masky",
    p.avatars.mode === "demo"
      ? demo(
          "Local initials avatars + opt-in browser TTS. Set AVATAR_PROVIDER=masky and MASKY_* to use Masky avatars.",
        )
      : await p.avatars.health(),
    p.avatars.mode,
  );
  const sink = await resolveLeadSink(db, orgId);
  await add(
    "n8n",
    sink.mode === "demo"
      ? demo(
          "Mock connection: approved exports are recorded locally and labelled demo/mock.",
        )
      : await sink.health(),
    sink.mode,
    true,
  );
  await add("research", await p.research.health(), p.research.mode);
  await add("sandbox", await p.sandbox.health(), p.sandbox.mode);
  const sn = snykStatus();
  out.push({
    provider: "snyk",
    ...META.snyk,
    status: sn.status,
    message: sn.message,
    checkedAt: sn.checkedAt,
    mode: "ci",
    config: {},
    hasSecret: false,
    canConfigure: false,
  });
  return out;
}

/**
 * Lead sink for an organization: a tested per-org n8n connection (only when
 * live external actions are enabled), else the env-configured sink, else mock.
 */
export async function resolveLeadSink(
  db: DB,
  orgId: string,
): Promise<LeadSinkProvider> {
  const e = env();
  const row = await saved(db, orgId, "n8n");
  if (
    e.LIVE_EXTERNAL_ACTIONS_ENABLED &&
    row?.testedOk &&
    row.secretCiphertext &&
    row.config.webhookUrl &&
    e.INTEGRATION_ENCRYPTION_KEY
  ) {
    return new N8nWebhookSink({
      webhookUrl: row.config.webhookUrl,
      baseUrl: row.config.baseUrl,
      secret: decryptSecret(row.secretCiphertext, e.INTEGRATION_ENCRYPTION_KEY),
    });
  }
  return providers().envLeadSink ?? new MockLeadSink();
}

export async function updateN8n(
  db: DB,
  auth: AuthContext,
  input: { webhookUrl?: string; baseUrl?: string; secret?: string },
) {
  const e = env();
  for (const u of [input.webhookUrl, input.baseUrl])
    if (u) assertSafeUrlSyntax(u);
  if (input.secret && !e.INTEGRATION_ENCRYPTION_KEY)
    throw new AppError(
      "encryption_unavailable",
      "Set INTEGRATION_ENCRYPTION_KEY before saving credentials",
      400,
    );
  const row = await saved(db, auth.orgId, "n8n");
  const config = {
    ...(row?.config ?? {}),
    ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
  };
  const values = {
    organizationId: auth.orgId,
    provider: "n8n" as const,
    status: "not_configured" as const,
    config,
    // Any change invalidates the previous successful test.
    testedOk: false,
    lastHealthCheckAt: null,
    lastHealthMessage: "Saved — run a test before exports can use it.",
    updatedBy: auth.userId,
    updatedAt: new Date(),
    ...(input.secret
      ? {
          secretCiphertext: encryptSecret(
            input.secret,
            e.INTEGRATION_ENCRYPTION_KEY!,
            1,
          ),
          secretKeyVersion: 1,
        }
      : {}),
  };
  if (row)
    await db
      .update(schema.integrationConnections)
      .set(values)
      .where(eq(schema.integrationConnections.id, row.id));
  else await db.insert(schema.integrationConnections).values(values);
  await audit(db, {
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "integration.update",
    targetType: "integration",
    targetId: "n8n",
    metadata: {
      fields: Object.keys(input).filter((k) => k !== "secret"),
      secretChanged: Boolean(input.secret),
    },
  });
  return { ok: true };
}

/** Safe test actions: health checks only — never an external write. */
export async function testIntegration(
  db: DB,
  auth: AuthContext,
  provider: string,
) {
  const p = providers();
  let health;
  switch (provider) {
    case "rocketride":
      health = await p.orchestrator.health();
      break;
    case "masky":
      health = await p.avatars.health();
      break;
    case "research":
      health = await p.research.health();
      break;
    case "sandbox":
      try {
        const r = await p.sandbox.runReviewed("score-stats", {
          scores: [90, 70, 50],
        });
        health = {
          status: (p.sandbox.mode === "demo"
            ? "mock"
            : "connected") as IntegrationStatus,
          message: `Reviewed program ran in ${r.durationMs}ms (${r.isolation})`,
          checkedAt: new Date(),
        };
      } catch (e) {
        health = {
          status: "error" as IntegrationStatus,
          message: e instanceof Error ? e.message : "sandbox error",
          checkedAt: new Date(),
        };
      }
      break;
    case "n8n": {
      const row = await saved(db, auth.orgId, "n8n");
      const e = env();
      if (
        row?.config.webhookUrl &&
        row.secretCiphertext &&
        e.INTEGRATION_ENCRYPTION_KEY
      ) {
        const sink = new N8nWebhookSink({
          webhookUrl: row.config.webhookUrl,
          baseUrl: row.config.baseUrl,
          secret: decryptSecret(
            row.secretCiphertext,
            e.INTEGRATION_ENCRYPTION_KEY,
          ),
        });
        health = await sink.health();
        await db
          .update(schema.integrationConnections)
          .set({
            status: health.status,
            testedOk: health.status === "connected",
            lastHealthCheckAt: health.checkedAt,
            lastHealthMessage: health.message,
          })
          .where(eq(schema.integrationConnections.id, row.id));
      } else {
        health = await (await resolveLeadSink(db, auth.orgId)).health();
      }
      break;
    }
    default:
      throw notFound("Integration");
  }
  await audit(db, {
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "integration.test",
    targetType: "integration",
    targetId: provider,
    metadata: { status: health.status },
  });
  return {
    provider,
    status: health.status,
    message: health.message,
    checkedAt: new Date(health.checkedAt).toISOString(),
  };
}

export async function recentAudit(db: DB, orgId: string, limit = 50) {
  return db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.organizationId, orgId))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit);
}
