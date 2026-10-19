import type { AgentIdentity, AvatarProvider, Health } from "../types";

/**
 * Agent faces and voices.
 *
 * Demo: accessible initials avatars rendered locally plus opt-in browser
 * speech synthesis — clearly labelled "browser TTS, not Masky".
 *
 * Masky.AI (live): REST API at https://masky.ai/api with `Authorization: Bearer`
 * (verified in docs/research/sponsor-docs.md). We use only documented calls:
 *   GET /api/avatars                 — key check / health
 *   GET /api/avatars/{id}/images     — primary avatar image for an agent
 * MASKY_AVATAR_IDS maps our slugs to Masky avatar ids, e.g.
 *   "alex=av_123,maya=av_456". Our slug stays the stable internal identity.
 * Masky speech is produced via conversation turns (no standalone TTS endpoint);
 * that flow costs credits and is not wired in this MVP.
 */
export class DemoAvatarProvider implements AvatarProvider {
  readonly id = "local-avatars";
  readonly mode = "demo" as const;
  async health(): Promise<Health> {
    return {
      status: "mock",
      message:
        "Local initials avatars + opt-in browser text-to-speech (not Masky).",
      checkedAt: new Date(),
    };
  }
  async identity(slug: string): Promise<AgentIdentity> {
    return {
      slug,
      avatarUrl: null,
      voice: { provider: "browser_tts", ref: null },
      providerLabel: "Local avatar · browser TTS (demo)",
    };
  }
}

export function parseAvatarMap(
  raw: string | undefined,
): Record<string, string> {
  return Object.fromEntries(
    (raw ?? "")
      .split(",")
      .map((p) => p.split("=").map((s) => s.trim()))
      .filter(([k, v]) => k && v && /^[A-Za-z0-9_-]{1,80}$/.test(v)),
  );
}

export class MaskyAvatarProvider implements AvatarProvider {
  readonly id = "masky";
  readonly mode = "live" as const;
  private cache = new Map<string, AgentIdentity>();

  constructor(
    private apiKey: string,
    private avatarIds: Record<string, string>,
    private baseUrl = "https://masky.ai/api",
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async get(path: string) {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Masky ${path} -> HTTP ${res.status}`);
    return res.json();
  }

  async health(): Promise<Health> {
    try {
      const data = (await this.get("/avatars")) as { avatars?: unknown[] };
      const mapped = Object.keys(this.avatarIds).length;
      return {
        status: mapped ? "connected" : "degraded",
        message: `Key accepted; ${data.avatars?.length ?? 0} avatars in account, ${mapped} mapped to agents.`,
        checkedAt: new Date(),
      };
    } catch (e) {
      return {
        status: "error",
        message: e instanceof Error ? e.message : "Masky check failed",
        checkedAt: new Date(),
      };
    }
  }

  async identity(slug: string): Promise<AgentIdentity> {
    const cached = this.cache.get(slug);
    if (cached) return cached;
    const avatarId = this.avatarIds[slug];
    let identity: AgentIdentity = {
      slug,
      avatarUrl: null,
      voice: { provider: "browser_tts", ref: null },
      providerLabel: "Masky not mapped · local avatar",
    };
    if (avatarId) {
      try {
        const data = (await this.get(
          `/avatars/${encodeURIComponent(avatarId)}/images`,
        )) as {
          primary?: string;
          images?: { url: string; isPrimary?: boolean }[];
        };
        const url =
          data.primary ?? data.images?.find((i) => i.isPrimary)?.url ?? null;
        identity = {
          slug,
          avatarUrl: url && url.startsWith("https://") ? url : null,
          voice: { provider: "browser_tts", ref: null },
          providerLabel: "Masky.AI avatar",
        };
      } catch {
        identity = { ...identity, providerLabel: "Masky error · local avatar" };
      }
    }
    this.cache.set(slug, identity);
    return identity;
  }
}
