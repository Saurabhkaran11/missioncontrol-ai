"use client";

import { useState } from "react";
import { api } from "./client-actions";
import { Button, Card, CardHeader, fieldClass } from "./ui";

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          const r = await api<{ inviteUrl: string }>("/api/v1/team/invite", {
            body: { email, role },
          });
          setLink(r.inviteUrl);
          setEmail("");
        } catch (e2) {
          setErr((e2 as Error).message);
        }
      }}
    >
      <div className="min-w-56 flex-1">
        <label htmlFor="inv-email" className="mb-1 block text-xs font-medium">
          Teammate email
        </label>
        <input
          id="inv-email"
          type="email"
          required
          className={fieldClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="inv-role" className="mb-1 block text-xs font-medium">
          Role
        </label>
        <select
          id="inv-role"
          className={fieldClass}
          value={role}
          onChange={(e) => setRole(e.target.value as "member" | "admin")}
        >
          <option value="member">Member — run missions, edit leads</option>
          <option value="admin">Admin — also approve & export</option>
        </select>
      </div>
      <Button type="submit">Create invite link</Button>
      {link && (
        <p className="w-full text-xs text-ink-2">
          Share this link (shown once; no email is sent):{" "}
          <code className="break-all font-mono">{link}</code>
        </p>
      )}
      {err && (
        <p role="alert" className="w-full text-sm text-bad">
          {err}
        </p>
      )}
    </form>
  );
}

export function DangerZone({ orgName }: { orgName: string }) {
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card className="ring-bad/30">
      <CardHeader
        title="Data controls"
        sub="Export everything, or permanently delete this workspace"
      />
      <div className="space-y-4 p-5">
        <a
          href="/api/v1/org/export"
          className="inline-flex rounded-lg px-4 py-2 text-sm font-medium ring-1 ring-line hover:bg-surface-2"
        >
          Download workspace data (JSON)
        </a>
        <div className="border-t border-line pt-4">
          <label
            htmlFor="del-confirm"
            className="mb-1 block text-xs font-medium"
          >
            Type <strong>{orgName}</strong> to delete the workspace and all
            missions, leads, drafts and approvals
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="del-confirm"
              className={fieldClass + " max-w-sm"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Button
              variant="danger"
              disabled={confirm !== orgName}
              onClick={async () => {
                try {
                  const r = await api<{ redirect: string }>("/api/v1/org", {
                    method: "DELETE",
                    body: { confirmName: confirm },
                  });
                  window.location.assign(r.redirect);
                } catch (e) {
                  setErr((e as Error).message);
                }
              }}
            >
              Delete workspace
            </Button>
          </div>
          {err && (
            <p role="alert" className="mt-2 text-sm text-bad">
              {err}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
