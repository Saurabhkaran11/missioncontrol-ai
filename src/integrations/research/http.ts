import { sha256 } from "@/shared/crypto";
import { looksLikeInjection, sanitizeExcerpt } from "@/features/evidence";
import { normalizeDomain } from "@/features/dedupe";
import type {
  Candidate,
  Health,
  ResearchProvider,
  SegmentResearch,
  Signal,
  SourceDoc,
} from "../types";
import { safeFetchText } from "./ssrf";

/**
 * Live research over plain HTTP for domains the user supplies on the mission
 * ("candidate domains"). No search API is used, no JavaScript is executed,
 * no logins are attempted. Page text is untrusted data: it is sanitised,
 * scanned for injection attempts and only ever stored as an excerpt.
 *
 * Signals are keyword-derived and therefore marked as *inferences* unless the
 * phrase appears verbatim in the excerpt — Sam then checks every claim.
 */
const TOOLS = [
  "zendesk",
  "intercom",
  "help scout",
  "freshdesk",
  "hubspot",
  "gorgias",
  "front",
  "salesforce service cloud",
];

function extract(html: string) {
  const title =
    /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html)?.[1]?.trim() ??
    "Untitled page";
  const meta =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,400})["']/i.exec(
      html,
    )?.[1] ?? "";
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&");
  return {
    title: sanitizeExcerpt(title, 200),
    text: sanitizeExcerpt(`${meta} ${body}`, 4000),
  };
}

function sentenceWith(text: string, re: RegExp): string | null {
  const s = text.split(/(?<=[.!?])\s+/).find((x) => re.test(x));
  return s ? sanitizeExcerpt(s, 300) : null;
}

export class HttpResearchProvider implements ResearchProvider {
  readonly id = "http-research";
  readonly mode = "live" as const;

  async health(): Promise<Health> {
    return {
      status: "connected",
      message:
        "HTTP page fetch with SSRF guard; researches only domains you list on a mission.",
      checkedAt: new Date(),
    };
  }

  async researchSegment(input: {
    icp: string;
    geography: string;
  }): Promise<SegmentResearch> {
    // Without a search API we do not invent market statistics: criteria come
    // straight from the founder's ICP and are marked as such.
    return {
      criteria: [
        {
          criterion: "ICP (from your onboarding)",
          detail: input.icp,
          sourceIndexes: [],
        },
        { criterion: "Geography", detail: input.geography, sourceIndexes: [] },
      ],
      sources: [],
      unknowns: [
        "No market-research search provider configured; criteria are taken from your ICP, not external sources.",
      ],
    };
  }

  async findCandidates(input: {
    count: number;
    seedDomains?: string[];
  }): Promise<Candidate[]> {
    const domains = (input.seedDomains ?? [])
      .map(normalizeDomain)
      .filter((d): d is string => Boolean(d))
      .slice(0, input.count);
    const out: Candidate[] = [];
    for (const domain of domains) {
      const sources: SourceDoc[] = [];
      const signals: Signal[] = [];
      try {
        const page = await safeFetchText(`https://${domain}/`);
        const { title, text } = extract(page.text);
        const excerpt = sanitizeExcerpt(text, 600);
        sources.push({
          url: page.url,
          title,
          excerpt,
          retrievedAt: new Date(),
          confidence: 0.6,
          contentHash: sha256(text),
          injectionSuspected: looksLikeInjection(text),
        });
        const saas = sentenceWith(text, /\b(saas|software|platform|app)\b/i);
        if (saas)
          signals.push({
            key: "segment",
            claim: saas,
            kind: "inference",
            sourceIndex: 0,
          });
        const support = sentenceWith(
          text,
          /\b(support|help center|helpdesk|tickets?)\b/i,
        );
        if (support)
          signals.push({
            key: "support_pain",
            claim: support,
            kind: "inference",
            sourceIndex: 0,
          });
        const tool = TOOLS.find((t) => text.toLowerCase().includes(t));
        if (tool)
          signals.push({
            key: "tooling",
            claim: `Page mentions ${tool}`,
            kind: "observed",
            sourceIndex: 0,
          });
      } catch (err) {
        // Unreachable or blocked domains are recorded as candidates with no
        // evidence; Leo's rubric will score them 0 rather than guessing.
        sources.length = 0;
        signals.length = 0;
        void err;
      }
      out.push({
        name: domain.split(".")[0].replace(/^\w/, (c) => c.toUpperCase()),
        domain,
        location: "Unknown",
        employeeRange: "Unknown",
        employees: null,
        segmentLabel: "Unknown",
        signals,
        sources,
      });
    }
    return out;
  }
}
