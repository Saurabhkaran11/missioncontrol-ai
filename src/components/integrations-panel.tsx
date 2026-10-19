"use client";

import { useState } from "react";
import { api } from "./client-actions";
import { Badge, Button, Card, StatusBadge, fieldClass, timeAgo } from "./ui";

type View = {
  provider: string;
  name: string;
  grants: string;
  status: string;
  message: string;
  checkedAt: string | null;
  mode: string;
  config: Record<string, string>;
  hasSecret: boolean;
  canConfigure: boolean;
  docs: string;
};

export function IntegrationsPanel({
  initial,
  canManage,
  liveWritesEnabled,
  encryptionReady,
}: {
  initial: View[];
  canManage: boolean;
  liveWritesEnabled: boolean;
  encryptionReady: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [n8n, setN8n] = useState({
    webhookUrl:
      initial.find((i) => i.provider === "n8n")?.config.webhookUrl ?? "",
    baseUrl: initial.find((i) => i.provider === "n8n")?.config.baseUrl ?? "",
    secret: "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  const test = async (provider: string) => {
    setBusy(provider);
    try {
      const r = await api<{
        status: string;
        message: string;
        checkedAt: string;
      }>(`/api/v1/integrations/${provider}/test`, { method: "POST" });
      setItems((xs) =>
        xs.map((x) =>
          x.provider === provider
            ? {
                ...x,
                status: r.status,
                message: r.message,
                checkedAt: r.checkedAt,
              }
            : x,
        ),
      );
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const saveN8n = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("n8n-save");
    setMsg(null);
    try {
      await api("/api/v1/integrations/n8n", {
        method: "PUT",
        body: {
          webhookUrl: n8n.webhookUrl || undefined,
          baseUrl: n8n.baseUrl || undefined,
          secret: n8n.secret || undefined,
        },
      });
      setN8n({ ...n8n, secret: "" });
      setItems((xs) =>
        xs.map((x) =>
          x.provider === "n8n"
            ? {
                ...x,
                hasSecret: x.hasSecret || Boolean(n8n.secret),
                status: "not_configured",
                message: "Saved — run a test before exports can use it.",
              }
            : x,
        ),
      );
      setMsg("Saved. The secret is encrypted and will not be shown again.");
    } catch (e2) {
      setMsg((e2 as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {msg && (
        <p role="status" className="rounded-lg bg-surface-2 px-4 py-2 text-sm">
          {msg}
        </p>
      )}
      {items.map((i) => (
        <Card key={i.provider} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{i.name}</h2>
                <StatusBadge status={i.status} />
                <Badge>{i.mode === "ci" ? "CI" : i.mode}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-2">
                <span className="font-medium">Grants:</span> {i.grants}
              </p>
              <p className="mt-1 text-sm text-muted">{i.message}</p>
              <p className="mt-1 text-xs text-muted">
                Last health check:{" "}
                {i.checkedAt ? timeAgo(i.checkedAt) : "never"} · Setup guide:{" "}
                <code className="font-mono">{i.docs}</code>
              </p>
            </div>
            {i.provider !== "snyk" && canManage && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === i.provider}
                onClick={() => test(i.provider)}
              >
                {busy === i.provider ? "Testing…" : "Run safe test"}
              </Button>
            )}
          </div>
          {i.provider === "n8n" && canManage && (
            <form
              onSubmit={saveN8n}
              className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-3"
            >
              <div>
                <label
                  htmlFor="n8n-url"
                  className="mb-1 block text-xs font-medium"
                >
                  Webhook URL (production /webhook/…)
                </label>
                <input
                  id="n8n-url"
                  type="url"
                  className={fieldClass}
                  value={n8n.webhookUrl}
                  onChange={(e) =>
                    setN8n({ ...n8n, webhookUrl: e.target.value })
                  }
                  placeholder="https://n8n.example.com/webhook/leads"
                />
              </div>
              <div>
                <label
                  htmlFor="n8n-base"
                  className="mb-1 block text-xs font-medium"
                >
                  n8n base URL (for /healthz)
                </label>
                <input
                  id="n8n-base"
                  type="url"
                  className={fieldClass}
                  value={n8n.baseUrl}
                  onChange={(e) => setN8n({ ...n8n, baseUrl: e.target.value })}
                  placeholder="https://n8n.example.com"
                />
              </div>
              <div>
                <label
                  htmlFor="n8n-secret"
                  className="mb-1 block text-xs font-medium"
                >
                  Shared secret{" "}
                  {i.hasSecret && (
                    <span className="text-ok">(saved — enter to replace)</span>
                  )}
                </label>
                <input
                  id="n8n-secret"
                  type="password"
                  autoComplete="off"
                  className={fieldClass}
                  value={n8n.secret}
                  onChange={(e) => setN8n({ ...n8n, secret: e.target.value })}
                  placeholder={i.hasSecret ? "••••••••" : "≥16 characters"}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3 md:col-span-3">
                <Button
                  size="sm"
                  type="submit"
                  disabled={busy === "n8n-save" || !encryptionReady}
                >
                  Save connection
                </Button>
                {!encryptionReady && (
                  <span className="text-xs text-warn">
                    Set INTEGRATION_ENCRYPTION_KEY on the server to store
                    credentials.
                  </span>
                )}
                <span className="text-xs text-muted">
                  Live writes are{" "}
                  {liveWritesEnabled
                    ? "enabled by the operator"
                    : "disabled (LIVE_EXTERNAL_ACTIONS_ENABLED=false) — exports stay mock"}
                  .
                </span>
              </div>
            </form>
          )}
        </Card>
      ))}
    </div>
  );
}
