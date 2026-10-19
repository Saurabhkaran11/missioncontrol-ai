import type { Finding, LeadFact, Personalization } from "@/db/schema";
import { checkPersonalizations, containsPersonalContact } from "./evidence";

/**
 * Sam's checks, as pure functions so they are unit-testable and identical
 * whether run by the worker or on a human edit.
 * Verdict precedence: any "block" > any "revise" > "pass".
 * Example: a draft citing "expanding into Europe" against a source that only
 * says "exploring international options" -> revise, code "unsupported_claim".
 */
export type EvidenceInfo = {
  excerpt: string;
  leadId: string | null;
  injectionSuspected?: boolean;
  url: string;
};

const PRESSURE =
  /\b(act now|last chance|guaranteed|risk[- ]free|limited time|you must)\b/i;

export function reviewLead(
  lead: {
    id: string;
    facts: LeadFact[];
    confidence: number;
    domain: string | null;
  },
  evidence: Map<string, EvidenceInfo>,
) {
  const findings: Finding[] = [];
  for (const f of lead.facts) {
    if (
      f.kind === "observed" &&
      !f.evidenceIds.some((id) => evidence.get(id)?.leadId === lead.id)
    )
      findings.push({
        code: "fact_without_source",
        severity: "error",
        message: `Observed fact has no linked source: "${f.claim}"`,
        target: "lead",
      });
    if (containsPersonalContact(f.claim))
      findings.push({
        code: "personal_data",
        severity: "error",
        message: "Fact contains personal contact details",
        target: "lead",
      });
  }
  const injected = [...evidence.values()].filter(
    (e) => e.leadId === lead.id && e.injectionSuspected,
  );
  for (const e of injected)
    findings.push({
      code: "prompt_injection_in_source",
      severity: "error",
      message: `Source ${e.url} contains instruction-like text. It was treated as data only; a human should confirm this lead.`,
      target: "lead",
      ref: e.url,
    });
  if (!lead.domain)
    findings.push({
      code: "missing_domain",
      severity: "warn",
      message: "No company domain; duplicates are harder to detect",
      target: "lead",
    });
  if (lead.confidence < 0.5)
    findings.push({
      code: "low_confidence",
      severity: "warn",
      message: `Evidence confidence is low (${lead.confidence})`,
      target: "lead",
    });
  return findings;
}

export function reviewDraft(
  draft: { body: string; subject: string; personalizations: Personalization[] },
  leadId: string,
  evidence: Map<string, EvidenceInfo>,
) {
  const findings: Finding[] = [];
  for (const c of checkPersonalizations(
    draft.personalizations,
    evidence,
    leadId,
  )) {
    if (!c.supported)
      findings.push({
        code: "unsupported_claim",
        severity: "error",
        message: `"${c.text}" — ${c.reason}`,
        target: "draft",
        ref: c.text,
      });
  }
  if (containsPersonalContact(draft.body))
    findings.push({
      code: "personal_data",
      severity: "error",
      message: "Draft contains personal contact details",
      target: "draft",
    });
  if (PRESSURE.test(`${draft.subject} ${draft.body}`))
    findings.push({
      code: "pressure_language",
      severity: "error",
      message: "Draft uses pressure language",
      target: "draft",
    });
  if (draft.body.length > 1500)
    findings.push({
      code: "too_long",
      severity: "warn",
      message: "Draft is longer than 1500 characters",
      target: "draft",
    });
  return findings;
}

export function verdictFor(findings: Finding[]): "pass" | "revise" | "block" {
  if (
    findings.some(
      (f) =>
        f.code === "prompt_injection_in_source" ||
        f.code === "personal_data" ||
        f.code === "fact_without_source",
    )
  )
    return "block";
  if (findings.some((f) => f.severity === "error")) return "revise";
  return "pass";
}
