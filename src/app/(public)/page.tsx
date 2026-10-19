import { AgentAvatar } from "@/components/agent-avatar";
import { DemoEnterButton, WaitlistForm } from "@/components/client-actions";
import { RoiEstimator } from "@/components/roi-estimator";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { AGENTS, AGENT_ORDER } from "@/features/agents/profiles";

const STEPS = [
  {
    n: "01",
    title: "You set the goal",
    body: "Describe your product, ideal customer, geography and exclusions. Alex turns it into a visible task graph.",
  },
  {
    n: "02",
    title: "Specialists research",
    body: "Maya gathers cited segment criteria. Leo finds and scores companies, de-duplicates them, and separates facts from guesses.",
  },
  {
    n: "03",
    title: "Drafts with receipts",
    body: "Sophia writes one editable draft per lead. Every personalised line links to the source it came from.",
  },
  {
    n: "04",
    title: "A reviewer pushes back",
    body: "Sam checks every claim against its source, flags unsafe pages and sends weak drafts back for revision.",
  },
  {
    n: "05",
    title: "You approve, Jordan ships",
    body: "Nothing leaves until you approve the exact version. Jordan then sends approved records to your n8n workflow.",
  },
];

export default function Landing() {
  return (
    <>
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-24">
          <div>
            <Badge tone="accent">
              For B2B SaaS & AI startups with 1–20 people
            </Badge>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
              A supervised AI ops team for your first sales pipeline.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-2">
              Six specialised AI agents research prospects, qualify them against
              your ICP and prepare evidence-backed outreach. You see every
              source, every handoff and every review — and nothing is exported
              or sent without your approval.
            </p>
            <div className="mt-8 flex flex-wrap items-start gap-3">
              <DemoEnterButton label="Open the live demo — no sign-up" />
              <ButtonLink href="/use-cases" variant="secondary">
                See the use case
              </ButtonLink>
            </div>
            <p className="mt-3 text-xs text-muted">
              The demo uses fictional companies on reserved .example domains and
              mock integrations, all labelled.
            </p>
          </div>
          <Card
            className="self-center p-5"
            aria-label="Illustration of a reviewed lead"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted">
                Illustration · fictional data
              </span>
              <Badge tone="sample">Sample</Badge>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <div className="font-semibold">Ledgerline</div>
                <div className="text-xs text-muted">
                  ledgerline.example · Toronto
                </div>
              </div>
              <div className="font-mono text-2xl font-semibold">100</div>
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="rounded-lg bg-ok-soft px-3 py-2 text-ok">
                ✓ “Support team of three answering tickets around the clock” —
                linked to /careers
              </li>
              <li className="rounded-lg bg-warn-soft px-3 py-2 text-warn">
                ↺ Sam: “expanding into Europe” is not supported by its source →
                sent back to Sophia
              </li>
              <li className="rounded-lg bg-accent-soft px-3 py-2 text-accent">
                ◆ Revised draft v2 awaiting your approval
              </li>
            </ul>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">The problem</h2>
        <p className="mt-3 max-w-3xl text-ink-2">
          Early-stage founders spend evenings on prospect research: hunting for
          companies that fit, guessing who has the pain, and writing outreach
          from scratch. Generic AI tools produce confident text with invented
          facts — which is worse than nothing when it lands in a customer’s
          inbox.
        </p>
        <ol className="mt-10 grid gap-4 md:grid-cols-5">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="rounded-xl bg-surface p-4 ring-1 ring-line"
            >
              <div className="font-mono text-xs text-accent">{s.n}</div>
              <div className="mt-2 font-medium">{s.title}</div>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Meet the team
              </h2>
              <p className="mt-2 text-sm text-muted">
                Synthetic AI characters with distinct roles and least-privilege
                tool access. Not people, never presented as people.
              </p>
            </div>
          </div>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AGENT_ORDER.map((slug) => {
              const a = AGENTS[slug];
              return (
                <li
                  key={slug}
                  className="flex gap-4 rounded-xl p-4 ring-1 ring-line"
                >
                  <AgentAvatar slug={slug} size={48} />
                  <div>
                    <div className="font-medium">
                      {a.displayName}{" "}
                      <span className="text-sm font-normal text-muted">
                        · {a.title}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs italic text-muted">
                      {a.character}
                    </p>
                    <p className="mt-2 text-sm text-ink-2">
                      {a.responsibility}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-6 md:grid-cols-3">
        {[
          {
            t: "Evidence before persuasion",
            b: "Every fact carries its source URL, retrieval time, excerpt and confidence — or is explicitly labelled an inference.",
          },
          {
            t: "Approval bound to the exact version",
            b: "Approvals are tied to a hash of the payload. Edit the draft afterwards and the old approval no longer counts.",
          },
          {
            t: "Honest status, always",
            b: "Integrations show connected, not configured, mock/demo, degraded or error. A mock export is never reported as sent.",
          },
        ].map((x) => (
          <Card key={x.t} className="p-5">
            <h3 className="font-medium">{x.t}</h3>
            <p className="mt-2 text-sm text-muted">{x.b}</p>
          </Card>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">
            What could this be worth to you?
          </h2>
          <p className="mb-5 mt-1 text-sm text-muted">
            Adjust the assumptions — they are yours, not ours.
          </p>
          <RoiEstimator />
        </Card>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              Watch the team work on a sample mission
            </h2>
            <p className="mt-1 text-sm text-muted">
              Or join the waitlist for design-partner access.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <DemoEnterButton />
            <WaitlistForm />
          </div>
        </div>
      </section>
    </>
  );
}
