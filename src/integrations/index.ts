import { env } from "@/shared/env";
import type {
  AgentOrchestrator,
  AvatarProvider,
  DraftWriter,
  LeadSinkProvider,
  ResearchProvider,
  SandboxProvider,
} from "./types";
import { DemoResearchProvider } from "./research/demo";
import { HttpResearchProvider } from "./research/http";
import { DemoSandboxProvider, UnavailableSandbox } from "./sandbox/demo";
import {
  DemoAvatarProvider,
  MaskyAvatarProvider,
  parseAvatarMap,
} from "./masky";
import { MockLeadSink, N8nWebhookSink } from "./n8n";
import { LocalDemoOrchestrator, RocketRideOrchestrator } from "./rocketride";
import { AnthropicDraftWriter, TemplateDraftWriter } from "./llm";

/**
 * Provider registry: the single place configuration selects implementations.
 * Env validation (shared/env.ts) already guarantees a live provider has its
 * credentials, so nothing here falls back to a mock behind the user's back.
 */
export type Providers = {
  research: ResearchProvider;
  sandbox: SandboxProvider;
  avatars: AvatarProvider;
  envLeadSink: LeadSinkProvider;
  orchestrator: AgentOrchestrator;
  drafts: DraftWriter;
};

const g = globalThis as unknown as { __mcProviders?: Providers };

export function buildProviders(): Providers {
  const e = env();
  return {
    research:
      e.WEB_RESEARCH_PROVIDER === "http"
        ? new HttpResearchProvider()
        : new DemoResearchProvider(),
    sandbox:
      e.SANDBOX_PROVIDER === "demo"
        ? new DemoSandboxProvider()
        : new UnavailableSandbox(
            e.SANDBOX_PROVIDER,
            e.SANDBOX_PROVIDER === "tenki"
              ? "Tenki SDK (@tenkicloud/sandbox) is documented but this adapter is not implemented or verified yet."
              : "Sandbox disabled by configuration.",
          ),
    avatars:
      e.AVATAR_PROVIDER === "masky"
        ? new MaskyAvatarProvider(
            e.MASKY_API_KEY!,
            parseAvatarMap(e.MASKY_AVATAR_IDS),
            e.MASKY_BASE_URL,
          )
        : new DemoAvatarProvider(),
    envLeadSink:
      e.LIVE_EXTERNAL_ACTIONS_ENABLED &&
      e.N8N_LEADS_WEBHOOK_URL &&
      e.N8N_WEBHOOK_SECRET
        ? new N8nWebhookSink({
            webhookUrl: e.N8N_LEADS_WEBHOOK_URL,
            secret: e.N8N_WEBHOOK_SECRET,
            baseUrl: e.N8N_BASE_URL,
            apiKey: e.N8N_API_KEY,
          })
        : new MockLeadSink(),
    orchestrator:
      e.ORCHESTRATOR_PROVIDER === "rocketride"
        ? new RocketRideOrchestrator({
            apiKey: e.ROCKETRIDE_API_KEY!,
            uri: e.ROCKETRIDE_BASE_URL!,
            pipelineFile: e.ROCKETRIDE_PIPELINE_FILE!,
          })
        : new LocalDemoOrchestrator(),
    drafts:
      e.LLM_PROVIDER === "anthropic"
        ? new AnthropicDraftWriter(e.ANTHROPIC_API_KEY!, e.ANTHROPIC_MODEL)
        : new TemplateDraftWriter(),
  };
}

export function providers(): Providers {
  if (!g.__mcProviders) g.__mcProviders = buildProviders();
  return g.__mcProviders;
}

export function setProvidersForTests(p: Partial<Providers>) {
  g.__mcProviders = { ...buildProviders(), ...p };
}
