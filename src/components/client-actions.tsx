"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, fieldClass } from "./ui";

/** JSON fetch helper that surfaces the API's { error: { message } } shape. */
export async function api<T = unknown>(
  url: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "content-type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (
      data as {
        error?: {
          message?: string;
          details?: { path: string; message: string }[];
        };
      }
    ).error;
    throw new Error(
      e?.details?.length
        ? `${e.message}: ${e.details.map((d) => `${d.path} ${d.message}`).join("; ")}`
        : (e?.message ?? `Request failed (${res.status})`),
    );
  }
  return data as T;
}

export function DemoEnterButton({
  label = "Enter the demo workspace",
  size = "md" as "md" | "sm",
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <Button
        size={size}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const r = await api<{ redirect: string }>("/api/v1/auth/demo", {
              method: "POST",
            });
            window.location.assign(r.redirect);
          } catch (e) {
            setErr((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparing your sample workspace…" : label}
      </Button>
      {err && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {err}
        </p>
      )}
    </div>
  );
}

export function LogoutButton() {
  return (
    <button
      className="text-xs text-muted hover:text-ink"
      onClick={async () => {
        const r = await api<{ redirect: string }>("/api/v1/auth/logout", {
          method: "POST",
        });
        window.location.assign(r.redirect);
      }}
    >
      Sign out
    </button>
  );
}

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    "idle",
  );
  const [msg, setMsg] = useState("");
  return (
    <form
      className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        try {
          await api("/api/v1/waitlist", { body: { email } });
          setState("done");
        } catch (err) {
          setState("error");
          setMsg((err as Error).message);
        }
      }}
    >
      <label htmlFor="wl-email" className="sr-only">
        Work email
      </label>
      <input
        id="wl-email"
        type="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={fieldClass}
      />
      <Button
        type="submit"
        variant="secondary"
        disabled={state === "busy" || state === "done"}
      >
        {state === "done" ? "You're on the list" : "Join the waitlist"}
      </Button>
      {state === "error" && (
        <p role="alert" className="text-sm text-bad">
          {msg}
        </p>
      )}
    </form>
  );
}

export function DevLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const r = await api<{ redirect: string }>("/api/v1/auth/dev-login", {
            body: { email, name },
          });
          router.push(r.redirect);
          router.refresh();
        } catch (e2) {
          setErr((e2 as Error).message);
          setBusy(false);
        }
      }}
    >
      <div>
        <label htmlFor="dl-name" className="mb-1 block text-sm font-medium">
          Your name
        </label>
        <input
          id="dl-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={fieldClass}
          autoComplete="name"
        />
      </div>
      <div>
        <label htmlFor="dl-email" className="mb-1 block text-sm font-medium">
          Work email
        </label>
        <input
          id="dl-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={fieldClass}
          autoComplete="email"
        />
      </div>
      {err && (
        <p role="alert" className="text-sm text-bad">
          {err}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Signing in…" : "Continue"}
      </Button>
    </form>
  );
}

/**
 * Opt-in voice playback via the browser's speech synthesis. Clearly labelled
 * as a browser voice — not Masky — and never auto-plays.
 */
export function VoiceButton({
  text,
  lang,
  rate,
  pitch,
  agentName,
}: {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  agentName: string;
}) {
  const [speaking, setSpeaking] = useState(false);
  return (
    <button
      type="button"
      className="rounded-md px-1.5 py-0.5 text-xs text-muted ring-1 ring-line hover:bg-surface-2 hover:text-ink"
      aria-pressed={speaking}
      aria-label={
        speaking
          ? `Stop ${agentName}'s voice`
          : `Play ${agentName}'s status update aloud (browser voice)`
      }
      onClick={() => {
        if (typeof window === "undefined" || !("speechSynthesis" in window))
          return;
        if (speaking) {
          window.speechSynthesis.cancel();
          setSpeaking(false);
          return;
        }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.rate = rate;
        u.pitch = pitch;
        u.onend = () => setSpeaking(false);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
        setSpeaking(true);
      }}
    >
      {speaking ? "■ Stop" : "▶ Listen"}
    </button>
  );
}
