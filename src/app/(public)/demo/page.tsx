import type { Metadata } from "next";
import { DemoEnterButton } from "@/components/client-actions";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Demo" };

export default function Demo() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        Try MissionControl with sample data
      </h1>
      <p className="mt-3 text-ink-2">
        You get a private sample workspace for a fictional AI support startup,
        with one completed mission and one running live so you can watch the
        agents hand work to each other.
      </p>
      <Card className="mt-8 p-6">
        <ul className="space-y-2 text-sm text-ink-2">
          <li>
            • All companies are fictional and use reserved{" "}
            <code className="font-mono">.example</code> domains.
          </li>
          <li>
            • Integrations run in mock/demo mode and say so. Nothing is sent
            anywhere.
          </li>
          <li>• Your workspace is isolated from other visitors.</li>
        </ul>
        <div className="mt-6">
          <DemoEnterButton />
        </div>
      </Card>
      <h2 className="mt-10 font-semibold">A 60-second tour</h2>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-2">
        <li>
          Open the running mission and watch Alex assign work and Maya hand
          criteria to Leo.
        </li>
        <li>
          Open the completed mission: see Sam send Ledgerline’s unsupported
          claim back to Sophia.
        </li>
        <li>
          In Approvals, compare evidence and draft side by side, then approve
          one lead.
        </li>
        <li>
          Release approved records — Jordan reports a clearly labelled mock n8n
          delivery.
        </li>
      </ol>
    </div>
  );
}
