import type { Metadata } from "next";
import { WaitlistForm } from "@/components/client-actions";
import { Badge, Card } from "@/components/ui";
import { PRICING_HYPOTHESES } from "@/features/gtm/pricing";

export const metadata: Metadata = { title: "Pricing (hypothesis)" };

export default function Pricing() {
  const p = PRICING_HYPOTHESES;
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <Badge tone="warn">{p.label}</Badge>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Pricing we are testing
      </h1>
      <p className="mt-3 max-w-2xl text-ink-2">
        These are hypotheses we are validating with design partners. There is no
        checkout and no paid plan today; nothing on this page is an offer to
        sell.
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {p.tiers.map((t) => (
          <Card key={t.name} className="flex flex-col p-6">
            <h2 className="font-medium">{t.name}</h2>
            <div className="mt-3">
              <span className="font-mono text-3xl font-semibold">
                {t.price}
              </span>{" "}
              <span className="text-sm text-muted">{t.period}</span>
            </div>
            <ul className="mt-4 space-y-1.5 text-sm text-ink-2">
              <li>{t.missions}</li>
              <li>{t.leads}</li>
              <li>{t.seats}</li>
            </ul>
            <p className="mt-auto pt-6 text-xs text-muted">{t.note}</p>
          </Card>
        ))}
      </div>
      <h2 className="mt-12 text-lg font-semibold">
        Open questions we are validating
      </h2>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-2">
        {p.questions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
      <div className="mt-10">
        <WaitlistForm />
      </div>
    </div>
  );
}
