import { canonicalJson, signWebhook } from "@/shared/crypto";
import type {
  DeliveryResult,
  Health,
  LeadExportPayload,
  LeadSinkProvider,
} from "../types";

/**
 * n8n lead export.
 *
 * Mock: records the delivery locally and returns mode "mock" — the UI shows
 * "demo/mock delivery", never "sent to CRM".
 *
 * Live: POSTs one approved lead to an n8n Webhook node (production URL form
 * /webhook/<path>, verified in docs/research/sponsor-docs.md). Authentication
 * uses the Webhook node's documented Header Auth (`X-MissionControl-Secret`)
 * plus our own HMAC signature headers the workflow can verify. The
 * Idempotency-Key header lets the workflow ignore retries; the sample workflow
 * in docs/n8n/ uses Google Sheets "appendOrUpdate" keyed on it so a retry
 * updates the same row instead of adding a duplicate.
 */
export class MockLeadSink implements LeadSinkProvider {
  readonly id = "n8n-mock";
  readonly mode = "demo" as const;
  readonly delivered = new Map<string, LeadExportPayload>();
  async health(): Promise<Health> {
    return {
      status: "mock",
      message:
        "Mock n8n: deliveries are recorded locally and labelled demo/mock. Nothing leaves this machine.",
      checkedAt: new Date(),
    };
  }
  async deliver(payload: LeadExportPayload): Promise<DeliveryResult> {
    const already = this.delivered.has(payload.idempotencyKey);
    this.delivered.set(payload.idempotencyKey, payload);
    return {
      ok: true,
      mode: "mock",
      externalRef: `mock-${payload.idempotencyKey.slice(0, 12)}`,
      summary: already
        ? "Mock: duplicate ignored (idempotent)"
        : "Mock: recorded locally (not sent)",
    };
  }
}

export class N8nWebhookSink implements LeadSinkProvider {
  readonly id = "n8n-webhook";
  readonly mode = "live" as const;
  constructor(
    private opts: {
      webhookUrl: string;
      secret: string;
      baseUrl?: string;
      apiKey?: string;
    },
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async health(): Promise<Health> {
    // /healthz is documented as the cheap liveness endpoint of an n8n instance.
    if (!this.opts.baseUrl)
      return {
        status: "degraded",
        message: "Webhook URL set; add N8N_BASE_URL to enable health checks.",
        checkedAt: new Date(),
      };
    try {
      const res = await this.fetchImpl(new URL("/healthz", this.opts.baseUrl), {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok
        ? {
            status: "connected",
            message: "n8n instance reachable (/healthz OK).",
            checkedAt: new Date(),
          }
        : {
            status: "error",
            message: `n8n /healthz returned HTTP ${res.status}`,
            checkedAt: new Date(),
          };
    } catch (e) {
      return {
        status: "error",
        message: e instanceof Error ? e.message : "n8n unreachable",
        checkedAt: new Date(),
      };
    }
  }

  async deliver(payload: LeadExportPayload): Promise<DeliveryResult> {
    const body = canonicalJson(payload);
    const ts = Math.floor(Date.now() / 1000);
    try {
      const res = await this.fetchImpl(this.opts.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-missioncontrol-secret": this.opts.secret,
          "x-missioncontrol-timestamp": String(ts),
          "x-missioncontrol-signature": `sha256=${signWebhook(this.opts.secret, ts, body)}`,
          "idempotency-key": payload.idempotencyKey,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const text = (await res.text()).slice(0, 200);
      if (res.ok)
        return {
          ok: true,
          mode: "live",
          externalRef: res.headers.get("x-n8n-execution-id"),
          summary: `n8n accepted (HTTP ${res.status})`,
        };
      return {
        ok: false,
        mode: "live",
        retryable: res.status >= 500 || res.status === 429,
        summary: `n8n HTTP ${res.status}: ${text}`,
      };
    } catch (e) {
      return {
        ok: false,
        mode: "live",
        retryable: true,
        summary: e instanceof Error ? e.message : "network error",
      };
    }
  }
}
