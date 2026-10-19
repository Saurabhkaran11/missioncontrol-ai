import crypto from "node:crypto";

/**
 * Deterministic JSON: object keys sorted recursively, so the same logical
 * payload always hashes the same.
 * Example: canonicalJson({b:1,a:[{d:2,c:3}]}) === '{"a":[{"c":3,"d":2}],"b":1}'
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

export const sha256 = (input: string) =>
  crypto.createHash("sha256").update(input).digest("hex");

/** Hash of an exportable payload; approvals bind to this value. */
export const payloadHash = (payload: unknown) => sha256(canonicalJson(payload));

export const randomToken = (bytes = 32) =>
  crypto.randomBytes(bytes).toString("base64url");

/** Constant-time string comparison (avoids timing side channels on secrets). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Webhook signature: hex HMAC-SHA256 over `${timestamp}.${rawBody}`.
 * Binding the timestamp into the MAC stops an attacker replaying an old body
 * with a fresh timestamp header.
 */
export function signWebhook(
  secret: string,
  timestamp: number,
  rawBody: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

export type SignatureCheck =
  { ok: true } | { ok: false; reason: "missing" | "stale" | "bad_signature" };

export function verifyWebhook(opts: {
  secret: string;
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  toleranceSeconds?: number;
  now?: number;
}): SignatureCheck {
  const { secret, rawBody, timestampHeader, signatureHeader } = opts;
  if (!timestampHeader || !signatureHeader)
    return { ok: false, reason: "missing" };
  const ts = Number(timestampHeader);
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (
    !Number.isFinite(ts) ||
    Math.abs(now - ts) > (opts.toleranceSeconds ?? 300)
  )
    return { ok: false, reason: "stale" };
  const expected = signWebhook(secret, ts, rawBody);
  const provided = signatureHeader.replace(/^sha256=/, "");
  return safeEqual(expected, provided)
    ? { ok: true }
    : { ok: false, reason: "bad_signature" };
}

/**
 * Envelope-style credential encryption with AES-256-GCM.
 * Ciphertext format: v<keyVersion>:<iv>:<tag>:<data> (base64url parts).
 * The key version lets operators rotate INTEGRATION_ENCRYPTION_KEY: decrypt
 * with the old key, re-encrypt with the new one (see docs/security.md).
 */
export function encryptSecret(
  plaintext: string,
  keyB64: string,
  keyVersion = 1,
): string {
  const key = Buffer.from(keyB64, "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    `v${keyVersion}`,
    iv.toString("base64url"),
    tag.toString("base64url"),
    data.toString("base64url"),
  ].join(":");
}

export function decryptSecret(ciphertext: string, keyB64: string): string {
  const [, ivB, tagB, dataB] = ciphertext.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(keyB64, "base64"),
    Buffer.from(ivB, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
