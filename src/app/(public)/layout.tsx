import Link from "next/link";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";

const NAV = [
  { href: "/use-cases", label: "Use case" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security & trust" },
  { href: "/demo", label: "Demo" },
];

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="MissionControl AI home">
            <Logo />
          </Link>
          <nav
            aria-label="Main"
            className="hidden items-center gap-6 text-sm text-ink-2 md:flex"
          >
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ButtonLink href="/signin" variant="ghost" size="sm">
              Sign in
            </ButtonLink>
            <ButtonLink href="/demo" size="sm">
              Try the demo
            </ButtonLink>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-muted sm:px-6">
          <span>
            MissionControl AI · hackathon prototype. Agents are synthetic AI
            characters, not people.
          </span>
          <nav aria-label="Footer" className="flex gap-4">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
