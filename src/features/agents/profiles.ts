import type { ToolPermission } from "@/db/schema";

/**
 * The six runtime agents. These are synthetic characters (clearly labelled in
 * the UI) — not people. Identity (name, colour, avatar/voice refs) is kept
 * separate from behaviour so a Masky.AI avatar can replace the local initials
 * avatar without touching mission logic.
 *
 * Tool permissions are enforced server-side by `assertAgentMay` — e.g. Maya
 * calling the n8n export throws, regardless of what any prompt says.
 */
export type AgentSlug = "alex" | "maya" | "leo" | "sophia" | "sam" | "jordan";

export type AgentDefinition = {
  slug: AgentSlug;
  displayName: string;
  title: string;
  character: string;
  responsibility: string;
  accentColor: string;
  glyph: string; // short role mark used inside the fallback avatar
  voice: { rate: number; pitch: number; language: string };
  toolPermissions: ToolPermission[];
};

export const AGENTS: Record<AgentSlug, AgentDefinition> = {
  alex: {
    slug: "alex",
    displayName: "Alex",
    title: "Mission Director",
    character: "Calm, decisive, collaborative and accountable.",
    responsibility:
      "Turns the goal into a task graph, assigns specialists, tracks dependencies and escalates decisions to you. Summarises — never does the research itself, never bypasses approvals.",
    accentColor: "#3346D3",
    glyph: "◆",
    voice: { rate: 0.98, pitch: 0.9, language: "en-US" },
    toolPermissions: [
      "tasks.plan",
      "approvals.request",
      "sandbox.run_reviewed",
    ],
  },
  maya: {
    slug: "maya",
    displayName: "Maya",
    title: "Market Research Analyst",
    character: "Curious, analytical, evidence-first.",
    responsibility:
      "Researches the target segment from public sources and returns cited criteria with retrieval times, confidence and open unknowns. Read-only: cannot touch your CRM.",
    accentColor: "#0F766E",
    glyph: "◎",
    voice: { rate: 1.02, pitch: 1.15, language: "en-GB" },
    toolPermissions: ["research.read"],
  },
  leo: {
    slug: "leo",
    displayName: "Leo",
    title: "Lead Generation Specialist",
    character: "Focused, resourceful, careful with uncertainty.",
    responsibility:
      "Finds companies matching the ICP, de-duplicates them, scores fit with an explainable rubric and separates observed facts from inferences.",
    accentColor: "#B45309",
    glyph: "▲",
    voice: { rate: 1.05, pitch: 1.0, language: "en-US" },
    toolPermissions: ["research.read", "leads.write", "sandbox.run_reviewed"],
  },
  sophia: {
    slug: "sophia",
    displayName: "Sophia",
    title: "Sales & Outreach Specialist",
    character: "Professional, concise, respectful, customer-focused.",
    responsibility:
      "Writes one editable draft per qualified lead using only your product context and source-backed facts, and explains every personalisation. Cannot send anything.",
    accentColor: "#BE185D",
    glyph: "✦",
    voice: { rate: 1.0, pitch: 1.2, language: "en-US" },
    toolPermissions: ["drafts.write"],
  },
  sam: {
    slug: "sam",
    displayName: "Sam",
    title: "Quality & Security Reviewer",
    character: "Skeptical, methodical, fair.",
    responsibility:
      "Checks evidence coverage, unsupported claims, duplicates, policy and unsafe content. Returns pass / revise / block with reasons. Cannot approve exports or edit its own reviews.",
    accentColor: "#4D7C0F",
    glyph: "✔",
    voice: { rate: 0.95, pitch: 0.85, language: "en-AU" },
    toolPermissions: ["review.write"],
  },
  jordan: {
    slug: "jordan",
    displayName: "Jordan",
    title: "Revenue Operations Manager",
    character: "Organised, practical, precise.",
    responsibility:
      "Validates field mappings, checks duplicates and sends only human-approved records to your n8n workflow, then reports delivery and reconciliation honestly.",
    accentColor: "#6D28D9",
    glyph: "■",
    voice: { rate: 1.0, pitch: 0.95, language: "en-US" },
    toolPermissions: ["export.n8n_after_approval"],
  },
};

export const AGENT_ORDER: AgentSlug[] = [
  "alex",
  "maya",
  "leo",
  "sophia",
  "sam",
  "jordan",
];

export function isAgentSlug(v: string): v is AgentSlug {
  return v in AGENTS;
}

export class PermissionDenied extends Error {
  constructor(agent: string, perm: ToolPermission) {
    super(`Agent "${agent}" is not permitted to use "${perm}"`);
    this.name = "PermissionDenied";
  }
}

/** Server-side least-privilege gate; prompts cannot widen it. */
export function assertAgentMay(
  agent: AgentSlug,
  perm: ToolPermission,
  granted?: ToolPermission[],
) {
  const allowed = granted ?? AGENTS[agent].toolPermissions;
  if (!allowed.includes(perm)) throw new PermissionDenied(agent, perm);
}
