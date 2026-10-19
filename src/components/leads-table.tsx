"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LeadReview } from "./lead-review";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  StatusBadge,
  cx,
  fieldClass,
} from "./ui";

type Row = {
  lead: {
    id: string;
    companyName: string;
    domain: string | null;
    score: number;
    rationale: string;
    status: string;
    stage: string;
    confidence: number;
    isSample: boolean;
    duplicateOfLeadId: string | null;
  };
  sourceCount: number;
  draftStatus: string | null;
  approvalStatus: string | null;
  missionTitle: string;
};

const STATUSES = [
  "all",
  "qualified",
  "needs_review",
  "approved",
  "exported",
  "rejected",
  "duplicate",
];

export function LeadsTable({
  rows,
  csvHref,
  canEdit,
  canDecide,
}: {
  rows: Row[];
  csvHref: string;
  canEdit: boolean;
  canDecide: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (status === "all" || r.lead.status === status) &&
          (!q ||
            `${r.lead.companyName} ${r.lead.domain ?? ""}`
              .toLowerCase()
              .includes(q.toLowerCase())),
      ),
    [rows, q, status],
  );
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label
            htmlFor="lead-q"
            className="mb-1 block text-xs font-medium text-ink-2"
          >
            Search company or domain
          </label>
          <input
            id="lead-q"
            className={fieldClass}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. ledgerline"
          />
        </div>
        <div>
          <label
            htmlFor="lead-status"
            className="mb-1 block text-xs font-medium text-ink-2"
          >
            Status
          </label>
          <select
            id="lead-status"
            className={fieldClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <ButtonLink href={csvHref} variant="secondary" prefetch={false}>
          Export CSV
        </ButtonLink>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No leads match"
          body={
            rows.length
              ? "Try a different search or status."
              : "Run a mission and Leo will add qualified companies here."
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <caption className="sr-only">Leads</caption>
            <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Company
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Score & rationale
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Sources
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Confidence
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Draft
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Approval
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((r) => (
                <tr
                  key={r.lead.id}
                  className={cx(
                    "hover:bg-surface-2",
                    open === r.lead.id && "bg-accent-soft",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <button
                      className="text-left font-medium text-ink hover:text-accent"
                      onClick={() => setOpen(r.lead.id)}
                    >
                      {r.lead.companyName}
                    </button>
                    <div className="text-xs text-muted">
                      {r.lead.domain ?? "—"}{" "}
                      {r.lead.isSample && (
                        <Badge tone="sample" className="ml-1">
                          fictional
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="max-w-sm px-4 py-2.5">
                    <span className="font-mono font-semibold tabular-nums">
                      {r.lead.score}
                    </span>{" "}
                    <span className="line-clamp-2 text-xs text-muted">
                      {r.lead.rationale}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={r.lead.status} />
                    <div className="mt-0.5 text-xs text-muted">
                      {r.lead.stage}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums">
                    {r.sourceCount}
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums">
                    {Math.round(r.lead.confidence * 100)}%
                  </td>
                  <td className="px-4 py-2.5">
                    {r.draftStatus ? (
                      <StatusBadge status={r.draftStatus} />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.approvalStatus ? (
                      <StatusBadge status={r.approvalStatus} />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {open && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-ink/30"
          onClick={() => setOpen(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Lead detail"
            className="h-full w-full max-w-2xl overflow-y-auto bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === "Escape" && setOpen(null)}
          >
            <div className="sticky top-0 flex justify-end border-b border-line bg-surface px-4 py-2">
              <button
                autoFocus
                className="rounded px-2 py-1 text-sm text-muted hover:bg-surface-2"
                onClick={() => setOpen(null)}
              >
                Close ✕
              </button>
            </div>
            <LeadReview
              key={open}
              leadId={open}
              canEdit={canEdit}
              canDecide={canDecide}
              onChanged={() => router.refresh()}
            />
          </div>
        </div>
      )}
    </>
  );
}
