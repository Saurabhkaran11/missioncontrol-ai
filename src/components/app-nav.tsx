"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const ITEMS = [
  { href: "/app", label: "Mission Control", exact: true },
  { href: "/app/missions/new", label: "New mission" },
  { href: "/app/approvals", label: "Approvals" },
  { href: "/app/leads", label: "Leads & deliverables" },
  { href: "/app/analytics", label: "Results" },
  { href: "/app/integrations", label: "Integrations" },
  { href: "/app/settings", label: "Settings & team" },
];

export function AppNav({ pendingApprovals }: { pendingApprovals: number }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Workspace"
      className="flex gap-1 overflow-x-auto md:flex-col"
    >
      {ITEMS.map((i) => {
        const active = i.exact ? path === i.href : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm",
              active
                ? "bg-accent-soft font-medium text-accent"
                : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            {i.label}
            {i.href === "/app/approvals" && pendingApprovals > 0 && (
              <span
                className="rounded-full bg-accent px-1.5 text-xs font-medium text-white"
                aria-label={`${pendingApprovals} pending`}
              >
                {pendingApprovals}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
