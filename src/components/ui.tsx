import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";

/** Small, consistent primitives. Status colour always carries a text label too. */
export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Tone = "neutral" | "accent" | "ok" | "warn" | "bad" | "sample";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 ring-line",
  accent: "bg-accent-soft text-accent ring-accent/20",
  ok: "bg-ok-soft text-ok ring-ok/20",
  warn: "bg-warn-soft text-warn ring-warn/25",
  bad: "bg-bad-soft text-bad ring-bad/20",
  sample: "bg-[#fff7d6] text-[#6b5200] ring-[#e8d48a]",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SampleBadge({ label = "Sample data" }: { label?: string }) {
  return <Badge tone="sample">{label}</Badge>;
}

const STATUS_TONE: Record<string, Tone> = {
  succeeded: "ok",
  connected: "ok",
  qualified: "ok",
  approved: "ok",
  exported: "ok",
  ready: "ok",
  pass: "ok",
  delivered: "ok",
  running: "accent",
  queued: "neutral",
  pending: "neutral",
  draft: "neutral",
  retrying: "warn",
  waiting: "neutral",
  needs_approval: "accent",
  needs_review: "warn",
  needs_revision: "warn",
  revise: "warn",
  paused: "warn",
  degraded: "warn",
  mock: "sample",
  blocked: "bad",
  failed: "bad",
  error: "bad",
  rejected: "bad",
  block: "bad",
  cancelled: "neutral",
  duplicate: "neutral",
  superseded: "neutral",
  not_configured: "neutral",
  dead: "bad",
  revision_requested: "warn",
};
const STATUS_LABEL: Record<string, string> = {
  needs_approval: "needs approval",
  needs_review: "needs review",
  needs_revision: "needs revision",
  not_configured: "not configured",
  mock: "mock/demo",
  revision_requested: "revision requested",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"}>
      {status === "running" && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-accent mc-pulse"
        />
      )}
      {STATUS_LABEL[status] ?? status.replace(/_/g, " ")}
    </Badge>
  );
}

type BtnProps = {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};
const BTN = {
  primary: "bg-accent text-white hover:bg-[#2737b8] shadow-sm",
  secondary:
    "bg-surface text-ink ring-1 ring-inset ring-line hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2",
  danger: "bg-bad text-white hover:bg-[#931c13]",
};
export function Button({
  variant = "primary",
  size = "md",
  className,
  ...p
}: ComponentProps<"button"> & BtnProps) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
        BTN[variant],
        className,
      )}
    />
  );
}
export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...p
}: ComponentProps<typeof Link> & BtnProps) {
  return (
    <Link
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
        BTN[variant],
        className,
      )}
    />
  );
}

export function Card({ className, children, ...p }: ComponentProps<"section">) {
  return (
    <section
      {...p}
      className={cx("rounded-xl bg-surface ring-1 ring-line", className)}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  sub,
  action,
}: {
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-surface p-4 ring-1 ring-line">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const fieldClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-ink"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function timeAgo(d: Date | string | null | undefined) {
  if (!d) return "—";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${Math.max(s, 0)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(d).toLocaleDateString();
}
