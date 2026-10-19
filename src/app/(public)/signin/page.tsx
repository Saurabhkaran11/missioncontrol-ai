import type { Metadata } from "next";
import { DemoEnterButton, DevLoginForm } from "@/components/client-actions";
import { Card } from "@/components/ui";
import { env } from "@/shared/env";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function SignIn() {
  const e = env();
  const supabase = Boolean(
    e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <Card className="mt-6 p-6">
        {e.DEMO_MODE && e.NODE_ENV !== "production" ? (
          <>
            <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
              Local development sign-in: no password, available only while
              DEMO_MODE is on. Production uses Supabase Auth.
            </p>
            <DevLoginForm />
          </>
        ) : supabase ? (
          <p className="text-sm text-ink-2">
            Supabase Auth is configured for this deployment. The hosted sign-in
            flow is documented in docs/operations.md and is not yet wired into
            this prototype UI.
          </p>
        ) : (
          <p className="text-sm text-ink-2">
            Sign-in is not configured on this deployment.
          </p>
        )}
      </Card>
      {e.DEMO_MODE && (
        <div className="mt-6 text-center">
          <p className="mb-3 text-sm text-muted">Just looking?</p>
          <DemoEnterButton size="sm" />
        </div>
      )}
    </div>
  );
}
