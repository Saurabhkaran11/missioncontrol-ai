"use client";

import { useEffect, useState } from "react";
import { api } from "./client-actions";
import { Badge, Button, StatusBadge, fieldClass, timeAgo } from "./ui";

export type LeadDetail = {
  lead: {
    id: string;
    companyName: string;
    domain: string | null;
    score: number;
    status: string;
    stage: string;
    confidence: number;
    rationale: string;
    location: string | null;
    segment: string | null;
    employeeRange: string | null;
    version: number;
    isSample: boolean;
    currentDraftId: string | null;
    scoreBreakdown: {
      criterion: string;
      points: number;
      max: number;
      reason: string;
      evidenceIds: string[];
    }[];
    facts: { claim: string; kind: string; evidenceIds: string[] }[];
  };
  evidence: {
    id: string;
    url: string;
    title: string;
    excerpt: string;
    retrievedAt: string;
    confidence: number;
    injectionSuspected: boolean;
    isSample: boolean;
  }[];
  drafts: {
    id: string;
    version: number;
    subject: string;
    body: string;
    status: string;
    generator: string;
    personalizations: { text: string; kind: string; evidenceIds: string[] }[];
    createdAt: string;
  }[];
  reviews: {
    id: string;
    round: number;
    verdict: string;
    findings: { code: string; severity: string; message: string }[];
    draftId: string | null;
    createdAt: string;
  }[];
  approvals: {
    id: string;
    status: string;
    payloadHash: string;
    payloadVersion: number;
    destination: string;
    createdAt: string;
    decidedAt: string | null;
  }[];
  duplicateOf: { id: string; companyName: string } | null;
};

/** Evidence, draft, Sam's verdicts and the exact payload version for one lead. Shared by Approvals and Leads. */
export function LeadReview({
  leadId,
  onChanged,
  canDecide,
  canEdit,
}: {
  leadId: string;
  onChanged?: () => void;
  canDecide: boolean;
  canEdit: boolean;
}) {
  const [d, setD] = useState<LeadDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const apply = (r: LeadDetail) => {
    setD(r);
    const cur = r.drafts.find((x) => x.id === r.lead.currentDraftId);
    setSubject(cur?.subject ?? "");
    setBodyText(cur?.body ?? "");
    setErr(null);
  };
  const load = () =>
    api<LeadDetail>(`/api/v1/leads/${leadId}`)
      .then(apply)
      .catch((e: Error) => setErr(e.message));
  // Callers pass key={leadId}, so switching leads remounts with fresh state.
  useEffect(() => {
    let live = true;
    api<LeadDetail>(`/api/v1/leads/${leadId}`)
      .then((r) => live && apply(r))
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [leadId]);

  if (err)
    return (
      <p role="alert" className="p-5 text-sm text-bad">
        {err}
      </p>
    );
  if (!d) return <p className="p-5 text-sm text-muted">Loading lead…</p>;

  const draft = d.drafts.find((x) => x.id === d.lead.currentDraftId);
  const review = d.reviews.find((r) => r.draftId === draft?.id) ?? d.reviews[0];
  const approval =
    d.approvals.find((a) => a.status === "pending") ?? d.approvals[0];
  const ev = new Map(d.evidence.map((e) => [e.id, e]));
  const evIndex = new Map(d.evidence.map((e, i) => [e.id, i + 1]));

  const decide = async (
    decision: "approve" | "reject" | "request_revision",
  ) => {
    if (!approval) return;
    if (decision !== "approve" && reason.trim().length < 3) {
      setMsg("Please give a short reason.");
      return;
    }
    if (
      decision === "approve" &&
      review &&
      review.verdict !== "pass" &&
      reason.trim().length < 3
    ) {
      setMsg("Sam did not pass this item. Add a reason to approve it anyway.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/v1/approvals/${approval.id}/decision`, {
        body: {
          decision,
          payloadHash: approval.payloadHash,
          reason: reason || undefined,
        },
      });
      setMsg(
        decision === "approve"
          ? "Approved this exact version."
          : decision === "reject"
            ? "Rejected."
            : "Revision requested — Sophia and Sam will rework it.",
      );
      await load();
      onChanged?.();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/v1/leads/${d.lead.id}`, {
        method: "PATCH",
        body: {
          draft: { subject, body: bodyText },
          expectedVersion: d.lead.version,
        },
      });
      setEditing(false);
      setMsg(
        "Saved as a new draft version. Sam re-checked it and a fresh approval was requested; the previous approval no longer applies.",
      );
      await load();
      onChanged?.();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="divide-y divide-line">
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{d.lead.companyName}</h2>
              <StatusBadge status={d.lead.status} />
              {d.lead.isSample && <Badge tone="sample">Fictional</Badge>}
            </div>
            <div className="text-xs text-muted">
              {d.lead.domain ?? "no domain"} ·{" "}
              {d.lead.location ?? "unknown location"} ·{" "}
              {d.lead.employeeRange ?? "?"} employees · {d.lead.segment}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl font-semibold tabular-nums">
              {d.lead.score}
            </div>
            <div className="text-xs text-muted">
              fit score · confidence {Math.round(d.lead.confidence * 100)}%
            </div>
          </div>
        </div>
        {d.duplicateOf && (
          <p className="mt-2 text-sm text-warn">
            Duplicate of {d.duplicateOf.companyName}.
          </p>
        )}
        <p className="mt-3 text-sm text-ink-2">{d.lead.rationale}</p>
        {d.lead.scoreBreakdown.length > 0 && (
          <table className="mt-3 w-full text-xs">
            <caption className="sr-only">Score breakdown</caption>
            <tbody>
              {d.lead.scoreBreakdown.map((b) => (
                <tr key={b.criterion} className="border-t border-line">
                  <th
                    scope="row"
                    className="py-1.5 pr-2 text-left font-medium text-ink-2"
                  >
                    {b.criterion}
                  </th>
                  <td className="py-1.5 pr-2 font-mono tabular-nums">
                    {b.points}/{b.max}
                  </td>
                  <td className="py-1.5 text-muted">
                    {b.reason}
                    {b.evidenceIds.map((id) => (
                      <sup key={id} className="ml-0.5 text-accent">
                        [{evIndex.get(id)}]
                      </sup>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="p-5">
        <h3 className="text-sm font-semibold">
          Evidence ({d.evidence.length})
        </h3>
        <ol className="mt-2 space-y-2">
          {d.evidence.map((e, i) => (
            <li
              key={e.id}
              className={`rounded-lg p-3 text-xs ring-1 ${e.injectionSuspected ? "bg-bad-soft ring-bad/30" : "bg-surface-2 ring-line"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-accent">[{i + 1}]</span>
                <span className="font-medium text-ink">{e.title}</span>
                {e.isSample && <Badge tone="sample">fictional source</Badge>}
                {e.injectionSuspected && (
                  <Badge tone="bad">
                    instruction-like text — treated as data
                  </Badge>
                )}
              </div>
              <div className="mt-1 break-all font-mono text-[11px] text-muted">
                {e.url}
              </div>
              <blockquote className="mt-1.5 text-ink-2">
                “{e.excerpt}”
              </blockquote>
              <div className="mt-1 text-muted">
                Retrieved {new Date(e.retrievedAt).toLocaleString()} · source
                confidence {Math.round(e.confidence * 100)}%
              </div>
            </li>
          ))}
          {d.evidence.length === 0 && (
            <li className="text-sm text-muted">
              No sources — nothing about this company is treated as fact.
            </li>
          )}
        </ol>
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Outreach draft{" "}
            {draft && (
              <span className="font-normal text-muted">
                v{draft.version} · {draft.generator}
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            {draft && <StatusBadge status={draft.status} />}
            {canEdit &&
              draft &&
              !editing &&
              !["exported"].includes(d.lead.status) && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing(true)}
                >
                  Edit
                </Button>
              )}
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          Prepared for you to send yourself — MissionControl never sends
          messages.
        </p>
        {!draft ? (
          <p className="mt-2 text-sm text-muted">No draft for this lead.</p>
        ) : editing ? (
          <div className="mt-3 space-y-2">
            <label htmlFor="ed-subj" className="text-xs font-medium">
              Subject
            </label>
            <input
              id="ed-subj"
              className={fieldClass}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <label htmlFor="ed-body" className="text-xs font-medium">
              Body
            </label>
            <textarea
              id="ed-body"
              rows={10}
              className={fieldClass}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={saveEdit}>
                Save new version
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                Discard
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-lg bg-surface-2 p-4 text-sm ring-1 ring-line">
            <div className="font-medium">{draft.subject}</div>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-ink-2">
              {draft.body}
            </pre>
          </div>
        )}
        {draft && draft.personalizations.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium text-ink-2">
              Why each personalisation is there
            </div>
            <ul className="mt-1 space-y-1 text-xs">
              {draft.personalizations.map((p) => (
                <li key={p.text} className="flex gap-2">
                  <Badge tone={p.kind === "observed" ? "ok" : "warn"}>
                    {p.kind}
                  </Badge>
                  <span className="text-ink-2">
                    {p.text}{" "}
                    {p.evidenceIds.map((id) => (
                      <sup key={id} className="text-accent">
                        [{evIndex.get(id) ?? "?"}]
                      </sup>
                    ))}
                    {p.evidenceIds.length === 0 && (
                      <span className="text-bad"> (no source)</span>
                    )}
                    {p.evidenceIds.some((id) => !ev.has(id)) && (
                      <span className="text-bad"> (source missing)</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {d.drafts.length > 1 && (
          <p className="mt-2 text-xs text-muted">
            History:{" "}
            {d.drafts.map((x) => `v${x.version} (${x.status})`).join(" · ")}
          </p>
        )}
      </div>

      <div className="p-5">
        <h3 className="text-sm font-semibold">Sam’s validation</h3>
        {d.reviews.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Not reviewed yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {d.reviews.map((r) => (
              <li
                key={r.id}
                className="rounded-lg p-3 text-xs ring-1 ring-line"
              >
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.verdict} />
                  <span className="text-muted">
                    {r.round === 99
                      ? "re-check after human edit"
                      : `round ${r.round}`}{" "}
                    · {timeAgo(r.createdAt)}
                  </span>
                </div>
                {r.findings.length ? (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-ink-2">
                    {r.findings.map((f, i) => (
                      <li key={i}>
                        <span className="font-mono text-muted">{f.code}</span> —{" "}
                        {f.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-ok">
                    All claims supported; no policy issues.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-5">
        <h3 className="text-sm font-semibold">Approval</h3>
        {approval ? (
          <div className="mt-2 space-y-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted">Status</dt>
              <dd>
                <StatusBadge status={approval.status} />
              </dd>
              <dt className="text-muted">Payload version</dt>
              <dd className="font-mono">
                v{approval.payloadVersion} · sha256{" "}
                {approval.payloadHash.slice(0, 12)}…
              </dd>
              <dt className="text-muted">Destination</dt>
              <dd className="font-mono">{approval.destination}</dd>
              <dt className="text-muted">Requested</dt>
              <dd>{timeAgo(approval.createdAt)} by Alex</dd>
            </dl>
            {approval.status === "pending" && canDecide && (
              <>
                <label
                  htmlFor="ap-reason"
                  className="block text-xs font-medium"
                >
                  Reason{" "}
                  {review && review.verdict !== "pass"
                    ? "(required — Sam did not pass this)"
                    : "(required to reject or request revision)"}
                </label>
                <input
                  id="ap-reason"
                  className={fieldClass}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Good fit; confirmed help-desk usage"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => decide("approve")}
                  >
                    Approve v{approval.payloadVersion}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => decide("request_revision")}
                  >
                    Request revision
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => decide("reject")}
                  >
                    Reject
                  </Button>
                </div>
              </>
            )}
            {approval.status === "pending" && !canDecide && (
              <p className="text-xs text-muted">
                Only owners and admins can approve exports.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">
            No approval requested for this lead.
          </p>
        )}
        {msg && (
          <p role="status" className="mt-2 text-sm text-ink-2">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
