/**
 * Structured JSON logger with redaction. Keys that look secret are masked and
 * long strings are truncated so prompts or research pages are never logged
 * wholesale.
 * Example: log.info("export.sent", { missionId, apiKey: "sk-1" })
 *   -> {"level":"info","msg":"export.sent","missionId":"…","apiKey":"[redacted]"}
 */
const SECRET_KEY =
  /(secret|token|password|api[-_]?key|authorization|cookie|ciphertext)/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (typeof value === "string")
    return value.length > 300 ? `${value.slice(0, 300)}…[truncated]` : value;
  if (Array.isArray(value))
    return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1),
      ]),
    );
  }
  return value;
}

function emit(
  level: "debug" | "info" | "warn" | "error",
  msg: string,
  fields?: Record<string, unknown>,
) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(redact(fields ?? {}) as object),
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => emit("error", m, f),
};
