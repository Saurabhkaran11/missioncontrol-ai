import type { Metadata } from "next";
import { DemoEnterButton } from "@/components/client-actions";
import { Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Use case: prospect research for early-stage B2B SaaS",
};

export default function UseCases() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <p className="text-sm font-medium text-accent">Use case</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Prospect research and sales ops for a 1–20 person SaaS team
      </h1>
      <p className="mt-4 text-ink-2">
        You have a product and an idea of who should buy it. You do not have a
        sales-ops person, a research analyst or the hours to do it properly.
        MissionControl gives you a supervised team that does the groundwork and
        shows its work.
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {[
          [
            "Before",
            "Evenings in spreadsheets and company websites; outreach written from memory; no record of why a company was chosen.",
          ],
          [
            "With MissionControl",
            "A ranked list where every score is explained and every claim is cited, editable drafts, and a one-click approval queue.",
          ],
          [
            "What you still decide",
            "Who is a fit, what gets said, and what is exported. Agents can be overruled on every item.",
          ],
          [
            "What it will not do",
            "Send emails, scrape behind logins, invent facts or contacts, or write to your CRM without an approval of that exact record.",
          ],
        ].map(([t, b]) => (
          <Card key={t} className="p-5">
            <h2 className="font-medium">{t}</h2>
            <p className="mt-2 text-sm text-muted">{b}</p>
          </Card>
        ))}
      </div>
      <h2 className="mt-12 text-xl font-semibold">The flagship mission</h2>
      <blockquote className="mt-3 border-l-4 border-accent pl-4 text-ink-2">
        “Find 20 potential customers for my AI SaaS product. Research their
        businesses, qualify them against my ideal customer profile, prepare
        personalized outreach drafts, validate the evidence, and save approved
        results to my sales pipeline.”
      </blockquote>
      <p className="mt-4 text-sm text-muted">
        The demo runs this mission for a fictional AI customer-support company,
        Northwind Assist, against fictional prospects.
      </p>
      <div className="mt-8">
        <DemoEnterButton />
      </div>
    </div>
  );
}
