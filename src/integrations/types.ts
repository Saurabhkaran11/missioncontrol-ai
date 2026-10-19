/**
 * Provider-neutral integration contracts. Mission logic depends only on these
 * interfaces; each sponsor or demo implementation lives in its own folder.
 * Every provider reports `mode` so the UI can label results "demo/mock" vs
 * "live" — a mock can never masquerade as a real delivery.
 */
import type { IntegrationStatus } from "@/db/schema";

export type ProviderMode = "demo" | "live";

export type Health = {
  status: IntegrationStatus;
  message: string;
  checkedAt: Date;
};

export type SourceDoc = {
  url: string;
  title: string;
  excerpt: string;
  retrievedAt: Date;
  confidence: number; // 0..1 — how much we trust this source for this claim
  contentHash: string;
  /** Retrieved text contained instruction-like content (prompt-injection attempt). */
  injectionSuspected?: boolean;
  isSample?: boolean;
};

export type SignalKey =
  | "segment"
  | "size"
  | "support_pain"
  | "geography"
  | "tooling"
  | "growth"
  | "exclusion";

export type Signal = {
  key: SignalKey;
  claim: string;
  kind: "observed" | "inference";
  sourceIndex: number; // index into Candidate.sources
};

export type Candidate = {
  name: string;
  domain: string | null;
  location: string;
  employeeRange: string;
  employees: number | null;
  segmentLabel: string;
  signals: Signal[];
  sources: SourceDoc[];
  isSample?: boolean;
};

export type SegmentResearch = {
  criteria: { criterion: string; detail: string; sourceIndexes: number[] }[];
  sources: SourceDoc[];
  unknowns: string[];
};

export interface ResearchProvider {
  readonly id: string;
  readonly mode: ProviderMode;
  health(): Promise<Health>;
  researchSegment(input: {
    icp: string;
    geography: string;
    productContext: string;
  }): Promise<SegmentResearch>;
  findCandidates(input: {
    icp: string;
    geography: string;
    exclusions: string[];
    count: number;
    seed: string;
  }): Promise<Candidate[]>;
}

export type SandboxResult = {
  programId: string;
  output: unknown;
  durationMs: number;
  isolation: string;
};

export interface SandboxProvider {
  readonly id: string;
  readonly mode: ProviderMode;
  health(): Promise<Health>;
  /** Runs one of a fixed set of reviewed programs. Arbitrary code is not accepted. */
  runReviewed(programId: string, input: unknown): Promise<SandboxResult>;
}

export type AgentIdentity = {
  slug: string;
  avatarUrl: string | null; // null => UI renders the accessible initials avatar
  voice: { provider: "browser_tts" | "masky" | "none"; ref: string | null };
  providerLabel: string;
};

export interface AvatarProvider {
  readonly id: string;
  readonly mode: ProviderMode;
  health(): Promise<Health>;
  identity(slug: string): Promise<AgentIdentity>;
}

export type DeliveryResult =
  | {
      ok: true;
      mode: "mock" | "live";
      externalRef: string | null;
      summary: string;
    }
  | { ok: false; mode: "mock" | "live"; retryable: boolean; summary: string };

export type LeadExportPayload = {
  schemaVersion: 1;
  approvalId: string;
  approvalPayloadHash: string;
  missionId: string;
  idempotencyKey: string;
  lead: {
    company: string;
    domain: string | null;
    score: number;
    rationale: string;
    location: string | null;
    sources: { url: string; title: string }[];
  };
  draft: { subject: string; body: string; version: number } | null;
  approvedBy: string;
  approvedAt: string;
};

export interface LeadSinkProvider {
  readonly id: string;
  readonly mode: ProviderMode;
  health(): Promise<Health>;
  deliver(payload: LeadExportPayload): Promise<DeliveryResult>;
}

/** What an orchestrator must do for one persisted task. */
export type TaskEnvelope = {
  taskId: string;
  missionId: string;
  organizationId: string;
  agentSlug: string;
  taskType: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
};

export interface AgentOrchestrator {
  readonly id: string;
  readonly mode: ProviderMode;
  health(): Promise<Health>;
  capabilities(): Promise<string[]>;
  /** Executes (or hands off) a task; resolves with the typed task output. */
  run(
    task: TaskEnvelope,
    execLocal: () => Promise<Record<string, unknown>>,
  ): Promise<{ output: Record<string, unknown>; externalRunId: string | null }>;
}

export interface DraftWriter {
  readonly id: string;
  readonly mode: ProviderMode;
  /** Returns body text; personalisations are chosen by domain code, not the model. */
  write(input: {
    company: string;
    productContext: string;
    tone: string;
    facts: { text: string; kind: "observed" | "inference" }[];
    senderName: string;
  }): Promise<{ subject: string; body: string }>;
}
