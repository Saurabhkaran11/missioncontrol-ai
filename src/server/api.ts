import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import crypto from "node:crypto";
import { getDb, type DB } from "@/db/client";
import { AppError, forbidden, unauthorized } from "@/shared/errors";
import { env } from "@/shared/env";
import { log } from "@/shared/logger";
import { roleCan, type Permission } from "@/features/approval-policy";
import { contextFromToken, SESSION_COOKIE, type AuthContext } from "./auth";
import { hit } from "./ratelimit";

/**
 * Route-handler wrapper used by every /api/v1 endpoint. It provides:
 *  - a correlation id (x-correlation-id header + error body),
 *  - CSRF defence: state-changing requests must come from our own Origin,
 *  - authentication + organization membership + role permission checks,
 *  - per-key rate limiting,
 *  - consistent error shape: { error: { code, message, correlationId, details? } }.
 */
type Ctx = {
  req: NextRequest;
  db: DB;
  auth: AuthContext;
  correlationId: string;
  params: Record<string, string>;
};
type PublicCtx = Omit<Ctx, "auth"> & { auth: AuthContext | null };

type Options = {
  perm?: Permission;
  public?: boolean;
  rateLimit?: { key: string; max?: number; windowSeconds?: number };
};

export function errorResponse(err: unknown, correlationId: string) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Request validation failed",
          correlationId,
          details: err.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
      },
      { status: 422, headers: { "x-correlation-id": correlationId } },
    );
  }
  if (err instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: err.code,
          message: err.message,
          correlationId,
          details: err.details,
        },
      },
      { status: err.status, headers: { "x-correlation-id": correlationId } },
    );
  }
  log.error("api.unhandled", {
    correlationId,
    error: err instanceof Error ? err.message : String(err),
  });
  return NextResponse.json(
    {
      error: {
        code: "internal_error",
        message: "Something went wrong",
        correlationId,
      },
    },
    { status: 500, headers: { "x-correlation-id": correlationId } },
  );
}

export function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const allowed = new Set([
    new URL(env().NEXT_PUBLIC_APP_URL).origin,
    req.nextUrl.origin,
  ]);
  if (!origin || !allowed.has(origin))
    throw new AppError("csrf_rejected", "Cross-site request blocked", 403);
}

export function clientIp(req: NextRequest) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();
}

export function route<P = Record<string, string>>(
  handler: (ctx: Ctx) => Promise<Response | unknown>,
  opts?: Options & { public?: false },
): (req: NextRequest, rc: { params: Promise<P> }) => Promise<Response>;
export function route<P = Record<string, string>>(
  handler: (ctx: PublicCtx) => Promise<Response | unknown>,
  opts: Options & { public: true },
): (req: NextRequest, rc: { params: Promise<P> }) => Promise<Response>;
export function route(
  handler: (ctx: never) => Promise<Response | unknown>,
  opts: Options = {},
) {
  return async (
    req: NextRequest,
    rc: { params: Promise<Record<string, string>> },
  ) => {
    const correlationId =
      req.headers.get("x-correlation-id")?.slice(0, 64) || crypto.randomUUID();
    try {
      assertSameOrigin(req);
      const db = await getDb();
      const auth = await contextFromToken(
        db,
        req.cookies.get(SESSION_COOKIE)?.value,
      );
      if (!opts.public) {
        if (!auth) throw unauthorized();
        if (opts.perm && !roleCan(auth.role, opts.perm)) throw forbidden();
      }
      if (opts.rateLimit) {
        const e = env();
        const key = `${opts.rateLimit.key}:${auth?.orgId ?? clientIp(req)}`;
        const r = hit(
          key,
          opts.rateLimit.max ?? e.RATE_LIMIT_MAX,
          opts.rateLimit.windowSeconds ?? e.RATE_LIMIT_WINDOW_SECONDS,
        );
        if (!r.allowed)
          throw new AppError(
            "rate_limited",
            `Too many requests; retry in ${r.retryAfter}s`,
            429,
            "transient",
          );
      }
      const params = (await rc?.params) ?? {};
      const out = await (handler as (c: PublicCtx) => Promise<unknown>)({
        req,
        db,
        auth,
        correlationId,
        params,
      });
      if (out instanceof Response) {
        out.headers.set("x-correlation-id", correlationId);
        return out;
      }
      return NextResponse.json(out ?? { ok: true }, {
        headers: { "x-correlation-id": correlationId },
      });
    } catch (err) {
      return errorResponse(err, correlationId);
    }
  };
}

export async function body<T>(
  req: NextRequest,
  schema: ZodType<T>,
): Promise<T> {
  const text = await req.text();
  if (text.length > 100_000)
    throw new AppError("payload_too_large", "Request body too large", 413);
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError("invalid_json", "Body must be JSON", 400);
  }
  return schema.parse(json);
}
