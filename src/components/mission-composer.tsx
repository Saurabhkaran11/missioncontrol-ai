"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./client-actions";
import { AgentAvatar } from "./agent-avatar";
import { Badge, Button, Card, CardHeader, Field, fieldClass } from "./ui";

type Defaults = {
  goal: string;
  productContext: string;
  icp: string;
  geography: string;
  exclusions: string[];
};

/** Natural-language goal + structured fields, with a preview of steps and external actions before starting. */
export function MissionComposer({
  defaults,
  liveResearch,
  exportMode,
}: {
  defaults: Defaults;
  liveResearch: boolean;
  exportMode: "mock" | "live";
}) {
  const router = useRouter();
  const [v, setV] = useState({
    ...defaults,
    title: "",
    requestedCount: 20,
    exclusionsText: defaults.exclusions.join("\n"),
    seedDomains: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set =
    (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV({
        ...v,
        [k]: k === "requestedCount" ? Number(e.target.value) : e.target.value,
      });

  const steps = [
    ["alex", "Plan the task graph and confirm defaults"],
    [
      "maya",
      liveResearch
        ? "Collect criteria (from your ICP; no search API configured)"
        : "Research the segment with cited sources",
    ],
    [
      "leo",
      `Find ~${v.requestedCount} companies, de-duplicate, score with an explainable rubric`,
    ],
    [
      "sophia",
      "Draft one editable message per qualified lead, linked to evidence",
    ],
    ["sam", "Check every claim against its source; send weak drafts back"],
    ["alex", "Ask you to approve the exact records"],
    [
      "jordan",
      `After your approval: export to n8n (${exportMode === "mock" ? "mock — nothing leaves" : "live webhook"})`,
    ],
  ] as const;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card className="p-6">
        <form
          className="grid gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              const r = await api<{ mission: { id: string } }>(
                "/api/v1/missions",
                {
                  body: {
                    title: v.title || undefined,
                    goal: v.goal,
                    productContext: v.productContext,
                    icp: v.icp,
                    geography: v.geography,
                    exclusions: v.exclusionsText
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                    requestedCount: v.requestedCount,
                    seedDomains: v.seedDomains
                      .split(/[\s,]+/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                    autoStart: true,
                  },
                },
              );
              router.push(`/app/missions/${r.mission.id}`);
            } catch (e2) {
              setErr((e2 as Error).message);
              setBusy(false);
            }
          }}
        >
          <Field
            label="Goal"
            htmlFor="mc-goal"
            hint="Say it the way you would to a colleague."
          >
            <textarea
              id="mc-goal"
              required
              rows={4}
              className={fieldClass}
              value={v.goal}
              onChange={set("goal")}
            />
          </Field>
          <Field label="Mission name (optional)" htmlFor="mc-title">
            <input
              id="mc-title"
              className={fieldClass}
              value={v.title}
              onChange={set("title")}
              placeholder="e.g. Q4 help-desk prospects"
            />
          </Field>
          <Field label="Product context" htmlFor="mc-product">
            <textarea
              id="mc-product"
              required
              rows={3}
              className={fieldClass}
              value={v.productContext}
              onChange={set("productContext")}
            />
          </Field>
          <Field label="Ideal customer profile" htmlFor="mc-icp">
            <textarea
              id="mc-icp"
              required
              rows={2}
              className={fieldClass}
              value={v.icp}
              onChange={set("icp")}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Geography" htmlFor="mc-geo">
              <input
                id="mc-geo"
                required
                className={fieldClass}
                value={v.geography}
                onChange={set("geography")}
              />
            </Field>
            <Field label="Number of prospects" htmlFor="mc-count" hint="1–50">
              <input
                id="mc-count"
                type="number"
                min={1}
                max={50}
                required
                className={fieldClass}
                value={v.requestedCount}
                onChange={set("requestedCount")}
              />
            </Field>
          </div>
          <Field label="Exclusions (one per line)" htmlFor="mc-excl">
            <textarea
              id="mc-excl"
              rows={3}
              className={fieldClass}
              value={v.exclusionsText}
              onChange={set("exclusionsText")}
            />
          </Field>
          {liveResearch && (
            <Field
              label="Candidate domains to research"
              htmlFor="mc-domains"
              hint="Live HTTP research only visits domains you list here (public pages, no logins)."
            >
              <textarea
                id="mc-domains"
                rows={2}
                className={fieldClass}
                value={v.seedDomains}
                onChange={set("seedDomains")}
                placeholder="example.com, another-company.com"
              />
            </Field>
          )}
          <div className="rounded-lg bg-surface-2 p-3 text-xs text-ink-2">
            <strong>Approvals:</strong> every export needs your approval of the
            exact record. <strong>Data use:</strong> public business information
            only; no personal contact details; no messages are sent.
          </div>
          {err && (
            <p role="alert" className="text-sm text-bad">
              {err}
            </p>
          )}
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? "Starting…" : "Start mission"}
            </Button>
          </div>
        </form>
      </Card>
      <Card className="self-start">
        <CardHeader
          title="What will happen"
          sub="Preview of steps and external actions"
        />
        <ol className="space-y-3 p-5">
          {steps.map(([slug, text], i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <AgentAvatar slug={slug} size={28} />
              <span className="pt-1 text-ink-2">{text}</span>
            </li>
          ))}
        </ol>
        <div className="border-t border-line p-5 text-xs text-muted">
          <div className="mb-2 font-medium text-ink">External actions</div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={liveResearch ? "accent" : "sample"}>
              Research:{" "}
              {liveResearch ? "public web (read-only)" : "fictional demo data"}
            </Badge>
            <Badge tone={exportMode === "mock" ? "sample" : "warn"}>
              n8n write: {exportMode === "mock" ? "mock" : "live"}, approval
              required
            </Badge>
            <Badge>Email: never sent</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
