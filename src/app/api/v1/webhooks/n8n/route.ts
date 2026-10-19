import { eq } from "drizzle-orm";
import { z } from "zod";
import { route } from "@/server/api";
import { schema } from "@/db/client";
import { verifyWebhook } from "@/shared/crypto";
import { env } from "@/shared/env";
import { AppError } from "@/shared/errors";

/**
 * Inbound confirmation from n8n after it wrote a row. Authenticated by HMAC
 * (x-missioncontrol-signature over `${timestamp}.${body}`, constant-time
 * compare), rejected outside a 5-minute window, and each eventId is accepted
 * once (replay protection). The body is trusted only after all three checks.
 */
const Body = z.object({
  eventId: z.string().min(8).max(100),
  idempotencyKey: z.string().max(200),
  status: z.enum(["written", "failed"]),
  externalRef: z.string().max(200).optional(),
});

export const POST = route(
  async ({ req, db }) => {
    const secret = env().N8N_WEBHOOK_SECRET;
    if (!secret)
      throw new AppError(
        "not_configured",
        "Inbound webhook not configured",
        404,
      );
    const raw = await req.text();
    const check = verifyWebhook({
      secret,
      rawBody: raw,
      timestampHeader: req.headers.get("x-missioncontrol-timestamp"),
      signatureHeader: req.headers.get("x-missioncontrol-signature"),
    });
    if (!check.ok)
      throw new AppError(
        "invalid_signature",
        `Webhook rejected (${check.reason})`,
        401,
      );
    const input = Body.parse(JSON.parse(raw));
    const inserted = await db
      .insert(schema.webhookReceipts)
      .values({ provider: "n8n", eventId: input.eventId })
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) return { ok: true, duplicate: true };
    await db
      .update(schema.webhookDeliveries)
      .set({
        responseSummary:
          input.status === "written"
            ? "Confirmed written by n8n"
            : "n8n reported failure",
        externalRef: input.externalRef ?? null,
      })
      .where(eq(schema.webhookDeliveries.idempotencyKey, input.idempotencyKey));
    return { ok: true };
  },
  {
    public: true,
    rateLimit: { key: "webhook.n8n", max: 120, windowSeconds: 60 },
  },
);
