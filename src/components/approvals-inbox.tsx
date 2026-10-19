"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./client-actions";
import { LeadReview } from "./lead-review";
import { Badge, Button, Card, EmptyState, cx } from "./ui";

type Item = {
  approval: {
    id: string;
    payloadHash: string;
    payloadVersion: number;
    missionId: string;
  };
  lead: {
    id: string;
    companyName: string;
    score: number;
    status: string;
    isSample: boolean;
  };
  missionTitle: string;
};

export function ApprovalsInbox({
  items,
  canDecide,
  canEdit,
}: {
  items: Item[];
  canDecide: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(items[0]?.lead.id ?? null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<null | "approve" | "reject">(
    null,
  );
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!items.length)
    return (
      <EmptyState
        title="Nothing waiting for you"
        body="When agents finish a mission, Alex asks you to approve each record here before anything is exported."
      />
    );

  const toggle = (id: string) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const chosen = items.filter((i) => checked.has(i.approval.id));

  const runBulk = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      const r = await api<{ results: { ok: boolean }[] }>(
        "/api/v1/approvals/bulk",
        {
          body: {
            decision: confirming,
            confirm: true,
            reason: reason || undefined,
            items: chosen.map((c) => ({
              approvalId: c.approval.id,
              payloadHash: c.approval.payloadHash,
            })),
          },
        },
      );
      const ok = r.results.filter((x) => x.ok).length;
      setResult(
        `${ok} of ${r.results.length} ${confirming === "approve" ? "approved" : "rejected"}${ok < r.results.length ? " — the rest changed since you loaded them; review individually" : ""}.`,
      );
      setChecked(new Set());
      setConfirming(null);
      router.refresh();
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card className="self-start">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-sm font-semibold">{items.length} pending</span>
          {canDecide && (
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                disabled={!chosen.length}
                onClick={() => setConfirming("approve")}
              >
                Approve {chosen.length || ""}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!chosen.length}
                onClick={() => setConfirming("reject")}
              >
                Reject
              </Button>
            </div>
          )}
        </div>
        {confirming && (
          <div
            role="dialog"
            aria-modal="false"
            aria-labelledby="bulk-title"
            className="border-b border-line bg-accent-soft p-4 text-sm"
          >
            <p id="bulk-title" className="font-medium">
              Confirm: {confirming} these {chosen.length} exact versions?
            </p>
            <ul className="mt-2 max-h-32 list-disc overflow-y-auto pl-5 text-xs text-ink-2">
              {chosen.map((c) => (
                <li key={c.approval.id}>
                  {c.lead.companyName} — payload v{c.approval.payloadVersion}
                </li>
              ))}
            </ul>
            {confirming === "reject" && (
              <input
                aria-label="Reason"
                className="mt-2 w-full rounded border border-line px-2 py-1 text-xs"
                placeholder="Reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={busy} onClick={runBulk}>
                Yes, {confirming} {chosen.length}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirming(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {result && (
          <p
            role="status"
            className="border-b border-line px-4 py-2 text-xs text-ink-2"
          >
            {result}
          </p>
        )}
        <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
          {items.map((i) => (
            <li
              key={i.approval.id}
              className={cx(
                "flex items-center gap-3 px-4 py-2.5",
                selected === i.lead.id && "bg-accent-soft",
              )}
            >
              {canDecide && (
                <input
                  type="checkbox"
                  aria-label={`Select ${i.lead.companyName}`}
                  checked={checked.has(i.approval.id)}
                  onChange={() => toggle(i.approval.id)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
              )}
              <button
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                onClick={() => setSelected(i.lead.id)}
                aria-current={selected === i.lead.id}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {i.lead.companyName}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {i.missionTitle}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {i.lead.status === "needs_review" && (
                    <Badge tone="warn">review</Badge>
                  )}
                  <span className="font-mono text-sm tabular-nums">
                    {i.lead.score}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        {selected && (
          <LeadReview
            key={selected}
            leadId={selected}
            canDecide={canDecide}
            canEdit={canEdit}
            onChanged={() => router.refresh()}
          />
        )}
      </Card>
    </div>
  );
}
