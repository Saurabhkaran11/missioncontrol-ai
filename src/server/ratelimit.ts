/**
 * Fixed-window rate limiter keyed by e.g. `mission.create:<orgId>`.
 * In-memory, so limits are per process — fine for a single web instance;
 * multi-instance deployments should back this with Redis or Postgres
 * (documented in docs/operations.md).
 * Example: hit("auth:1.2.3.4", 10, 60) allows 10 calls per minute per IP.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function hit(
  key: string,
  max: number,
  windowSeconds: number,
  now = Date.now(),
) {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: max - 1, retryAfter: 0 };
  }
  b.count++;
  if (b.count > max)
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((b.resetAt - now) / 1000),
    };
  return { allowed: true, remaining: max - b.count, retryAfter: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}
