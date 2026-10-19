import { z } from "zod";

/**
 * Validated server-side configuration.
 *
 * Every provider defaults to the deterministic `demo` implementation so a fresh
 * clone runs with zero credentials. Selecting a live provider without its
 * credentials fails fast with a redacted message instead of silently falling
 * back to a mock (principle 4: honest integration status).
 *
 * Example: WEB_RESEARCH_PROVIDER=http needs no key, but SANDBOX_PROVIDER=tenki
 * without TENKI_API_KEY throws
 *   "Invalid configuration: SANDBOX_PROVIDER=tenki requires TENKI_API_KEY".
 */

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === ""
        ? fallback
        : ["1", "true", "yes", "on"].includes(v.toLowerCase()),
    );

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const optionalUrl = optionalString.refine(
  (v) => v === undefined || /^https?:\/\//.test(v),
  "must be an http(s) URL",
);

const int = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : Number(v)))
    .pipe(z.number().int().min(min).max(max));

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  DEMO_MODE: bool(true),
  LIVE_EXTERNAL_ACTIONS_ENABLED: bool(false),

  DATABASE_URL: optionalString,
  DIRECT_DATABASE_URL: optionalString,
  PGLITE_DATA_DIR: z.string().default(".data/pglite"),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  INTEGRATION_ENCRYPTION_KEY: optionalString,
  SESSION_SECRET: optionalString,

  LLM_PROVIDER: z.enum(["demo", "anthropic"]).default("demo"),
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),

  ORCHESTRATOR_PROVIDER: z.enum(["demo", "rocketride"]).default("demo"),
  ROCKETRIDE_API_KEY: optionalString,
  ROCKETRIDE_BASE_URL: optionalString, // https://api.rocketride.ai or ws://localhost:5565
  ROCKETRIDE_WORKSPACE_ID: optionalString,
  ROCKETRIDE_PIPELINE_ID: optionalString,
  ROCKETRIDE_PIPELINE_FILE: optionalString,

  AVATAR_PROVIDER: z.enum(["demo", "masky"]).default("demo"),
  MASKY_API_KEY: optionalString,
  MASKY_BASE_URL: optionalUrl,
  MASKY_WORKSPACE_ID: optionalString,
  MASKY_AVATAR_IDS: optionalString,

  N8N_BASE_URL: optionalUrl,
  N8N_API_KEY: optionalString,
  N8N_LEADS_WEBHOOK_URL: optionalUrl,
  N8N_WEBHOOK_SECRET: optionalString,

  WEB_RESEARCH_PROVIDER: z.enum(["demo", "http"]).default("demo"),
  WEB_RESEARCH_API_KEY: optionalString,
  SANDBOX_PROVIDER: z.enum(["demo", "tenki", "disabled"]).default("demo"),
  TENKI_API_KEY: optionalString,

  WORKER_CONCURRENCY: int(2, 1, 16),
  EMBEDDED_WORKER: optionalString,
  DEMO_STEP_DELAY_MS: int(900, 0, 10_000),
  MISSION_TIMEOUT_SECONDS: int(900, 30, 86_400),
  RATE_LIMIT_MAX: int(60, 1, 10_000),
  RATE_LIMIT_WINDOW_SECONDS: int(60, 1, 3_600),
  CRON_SECRET: optionalString,
  SENTRY_DSN: optionalString,
});

export type Env = z.infer<typeof EnvSchema>;

/** Cross-field rules: a live provider must have its credentials. */
function crossValidate(env: Env): string[] {
  const problems: string[] = [];
  const need = (cond: boolean, msg: string) => {
    if (cond) problems.push(msg);
  };
  need(
    env.LLM_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY,
    "LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY",
  );
  need(
    env.ORCHESTRATOR_PROVIDER === "rocketride" &&
      (!env.ROCKETRIDE_API_KEY ||
        !env.ROCKETRIDE_BASE_URL ||
        !env.ROCKETRIDE_PIPELINE_FILE),
    "ORCHESTRATOR_PROVIDER=rocketride requires ROCKETRIDE_API_KEY, ROCKETRIDE_BASE_URL and ROCKETRIDE_PIPELINE_FILE",
  );
  need(
    env.AVATAR_PROVIDER === "masky" && !env.MASKY_API_KEY,
    "AVATAR_PROVIDER=masky requires MASKY_API_KEY",
  );
  need(
    env.SANDBOX_PROVIDER === "tenki" && !env.TENKI_API_KEY,
    "SANDBOX_PROVIDER=tenki requires TENKI_API_KEY",
  );
  need(
    env.LIVE_EXTERNAL_ACTIONS_ENABLED &&
      (!env.N8N_LEADS_WEBHOOK_URL || !env.N8N_WEBHOOK_SECRET),
    "LIVE_EXTERNAL_ACTIONS_ENABLED=true requires N8N_LEADS_WEBHOOK_URL and N8N_WEBHOOK_SECRET",
  );
  if (env.INTEGRATION_ENCRYPTION_KEY) {
    // 32 random bytes, base64-encoded (openssl rand -base64 32).
    const raw = Buffer.from(env.INTEGRATION_ENCRYPTION_KEY, "base64");
    need(
      raw.length !== 32,
      "INTEGRATION_ENCRYPTION_KEY must be 32 bytes, base64-encoded",
    );
  }
  if (env.NODE_ENV === "production") {
    need(
      !env.SESSION_SECRET || env.SESSION_SECRET.length < 32,
      "SESSION_SECRET (>=32 chars) is required in production",
    );
    need(
      !env.INTEGRATION_ENCRYPTION_KEY,
      "INTEGRATION_ENCRYPTION_KEY is required in production",
    );
    need(
      !env.DATABASE_URL,
      "DATABASE_URL is required in production (embedded PGlite is for local demo only)",
    );
  }
  return problems;
}

let cached: Env | undefined;

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Only variable names and rule messages are reported, never values.
    const fields = parsed.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    );
    throw new Error(`Invalid configuration: ${fields.join("; ")}`);
  }
  const problems = crossValidate(parsed.data);
  if (problems.length)
    throw new Error(`Invalid configuration: ${problems.join("; ")}`);
  return parsed.data;
}

export function env(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}

/** For tests: override configuration without touching process.env. */
export function setEnvForTests(overrides: Record<string, string | undefined>) {
  cached = loadEnv({ ...process.env, NODE_ENV: "test", ...overrides });
}
