import type { Candidate, SignalKey } from "@/integrations/types";
import type { ScoreBreakdown } from "@/db/schema";

/**
 * Explainable ICP fit rubric (0–100). Each criterion earns points only when a
 * signal backs it; missing evidence scores 0 with the reason "no evidence
 * found" — Leo never fills gaps with guesses. Inferred signals earn 60% of the
 * points so observed facts always outweigh inferences.
 *
 * Example: a SaaS company (observed, 25) with 40 staff (observed, 20), a
 * support-hiring post (observed, 25), in the UK (observed, 15) and no tooling
 * signal (0) scores 85 -> "qualified".
 */
export const RUBRIC: { key: SignalKey; criterion: string; max: number }[] = [
  { key: "segment", criterion: "B2B SaaS segment fit", max: 25 },
  { key: "size", criterion: "Team size in ICP range", max: 20 },
  { key: "support_pain", criterion: "Visible support workload", max: 25 },
  { key: "geography", criterion: "Target geography", max: 15 },
  { key: "tooling", criterion: "Compatible support tooling", max: 15 },
];

export const THRESHOLDS = { qualified: 65, review: 45 } as const;
const INFERENCE_WEIGHT = 0.6;

export type ScoreResult = {
  score: number;
  breakdown: ScoreBreakdown;
  status: "qualified" | "needs_review" | "rejected";
  confidence: number;
  rationale: string;
  excludedBy: string | null;
};

export function scoreCandidate(
  c: Candidate,
  evidenceIds: string[],
  exclusions: string[] = [],
): ScoreResult {
  const breakdown: ScoreBreakdown = RUBRIC.map(({ key, criterion, max }) => {
    const signal =
      c.signals.find((s) => s.key === key && s.kind === "observed") ??
      c.signals.find((s) => s.key === key);
    if (!signal)
      return {
        criterion,
        points: 0,
        max,
        reason: "No evidence found",
        evidenceIds: [],
      };
    const points = Math.round(
      signal.kind === "observed" ? max : max * INFERENCE_WEIGHT,
    );
    const reason =
      signal.kind === "observed" ? signal.claim : `Inference: ${signal.claim}`;
    return {
      criterion,
      points,
      max,
      reason,
      evidenceIds: evidenceIds[signal.sourceIndex]
        ? [evidenceIds[signal.sourceIndex]]
        : [],
    };
  });
  const score = breakdown.reduce((n, b) => n + b.points, 0);

  // Exclusions are hard rules from the founder, matched against explicit
  // exclusion signals and the segment label.
  const exclusionSignal = c.signals.find((s) => s.key === "exclusion");
  const lowered =
    `${c.segmentLabel} ${exclusionSignal?.claim ?? ""}`.toLowerCase();
  const excludedBy =
    exclusions.find((ex) => {
      const words = ex
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3);
      return (
        words.length > 0 &&
        words.some((w) => lowered.includes(w)) &&
        Boolean(exclusionSignal)
      );
    }) ?? (exclusionSignal ? exclusionSignal.claim : null);

  const usedSources = c.signals
    .map((s) => c.sources[s.sourceIndex])
    .filter(Boolean);
  const avgSourceConf = usedSources.length
    ? usedSources.reduce((n, s) => n + s.confidence, 0) / usedSources.length
    : 0;
  const coverage = breakdown.filter((b) => b.points > 0).length / RUBRIC.length;
  const confidence =
    Math.round(avgSourceConf * (0.5 + 0.5 * coverage) * 100) / 100;

  let status: ScoreResult["status"] =
    score >= THRESHOLDS.qualified
      ? "qualified"
      : score >= THRESHOLDS.review
        ? "needs_review"
        : "rejected";
  if (excludedBy) status = "rejected";
  if (status === "qualified" && confidence < 0.5) status = "needs_review";

  const strongest = breakdown
    .filter((b) => b.points === b.max)
    .map((b) => b.criterion.toLowerCase());
  const gaps = breakdown
    .filter((b) => b.points === 0)
    .map((b) => b.criterion.toLowerCase());
  const rationale = excludedBy
    ? `Excluded: ${excludedBy}.`
    : `${score}/100. Strong on ${strongest.join(", ") || "no criteria"}${gaps.length ? `; no evidence for ${gaps.join(", ")}` : ""}.`;

  return { score, breakdown, status, confidence, rationale, excludedBy };
}
