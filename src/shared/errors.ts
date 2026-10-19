/**
 * Application error with a stable code, HTTP status and a retry class.
 * `transient` errors (timeouts, 5xx, rate limits) are retried with backoff;
 * `permanent` ones (validation, authorization) go straight to failed/human review.
 * Example: new AppError("stale_approval", "Payload changed since approval", 409)
 */
export type ErrorClass = "transient" | "permanent";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public errorClass: ErrorClass = "permanent",
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Resource") =>
  new AppError("not_found", `${what} not found`, 404);
export const forbidden = (msg = "You do not have permission to do that") =>
  new AppError("forbidden", msg, 403);
export const unauthorized = () =>
  new AppError("unauthorized", "Sign in required", 401);
export const conflict = (code: string, msg: string) =>
  new AppError(code, msg, 409);
export const transient = (code: string, msg: string) =>
  new AppError(code, msg, 503, "transient");

export function classifyError(err: unknown): ErrorClass {
  if (err instanceof AppError) return err.errorClass;
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed|429|50[234]/i.test(
    msg,
  )
    ? "transient"
    : "permanent";
}
