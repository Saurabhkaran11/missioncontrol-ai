import type { LeadFact, Personalization } from "@/db/schema";

/**
 * Chooses which facts Sophia may personalise with: support pain first, then
 * growth news, then tooling — at most three, never the injection-flagged or
 * excluded ones. Each personalisation carries its evidence ids so Sam (and
 * the human reviewer) can trace every sentence to a source.
 * `drop` removes claims Sam rejected during a revision round.
 */
const PRIORITY = ["support_pain", "growth", "tooling"];

export function choosePersonalizations(
  facts: (LeadFact & { key?: string })[],
  drop: string[] = [],
): Personalization[] {
  return facts
    .filter((f) => !drop.includes(f.claim))
    .filter((f) => f.key && PRIORITY.includes(f.key))
    .sort((a, b) => PRIORITY.indexOf(a.key!) - PRIORITY.indexOf(b.key!))
    .slice(0, 3)
    .map((f) => ({ text: f.claim, kind: f.kind, evidenceIds: f.evidenceIds }));
}
