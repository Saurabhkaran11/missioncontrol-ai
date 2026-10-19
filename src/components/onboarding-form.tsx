"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./client-actions";
import { Button, Field, fieldClass } from "./ui";

export type ProfileValues = {
  companyName: string;
  productDescription: string;
  icp: string;
  geography: string;
  exclusions: string[];
  tone: string;
  desiredOutput: string;
};

export function OnboardingForm({ initial }: { initial: ProfileValues }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [exclusions, setExclusions] = useState(initial.exclusions.join("\n"));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set =
    (k: keyof ProfileValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV({ ...v, [k]: e.target.value });
  return (
    <form
      className="grid gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await api("/api/v1/onboarding", {
            method: "PUT",
            body: {
              ...v,
              exclusions: exclusions
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            },
          });
          router.push("/app");
          router.refresh();
        } catch (e2) {
          setErr((e2 as Error).message);
          setBusy(false);
        }
      }}
    >
      <Field label="Company name" htmlFor="ob-company">
        <input
          id="ob-company"
          required
          className={fieldClass}
          value={v.companyName}
          onChange={set("companyName")}
        />
      </Field>
      <Field
        label="What does your product do?"
        htmlFor="ob-product"
        hint="Sophia only uses this text to describe your product — keep it factual."
      >
        <textarea
          id="ob-product"
          required
          rows={3}
          className={fieldClass}
          value={v.productDescription}
          onChange={set("productDescription")}
        />
      </Field>
      <Field label="Ideal customer profile" htmlFor="ob-icp">
        <textarea
          id="ob-icp"
          required
          rows={2}
          className={fieldClass}
          value={v.icp}
          onChange={set("icp")}
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Geography" htmlFor="ob-geo">
          <input
            id="ob-geo"
            required
            className={fieldClass}
            value={v.geography}
            onChange={set("geography")}
          />
        </Field>
        <Field label="Preferred voice & tone" htmlFor="ob-tone">
          <input
            id="ob-tone"
            required
            className={fieldClass}
            value={v.tone}
            onChange={set("tone")}
          />
        </Field>
      </div>
      <Field
        label="Exclusions (one per line)"
        htmlFor="ob-excl"
        hint="Hard rules — matching companies are rejected."
      >
        <textarea
          id="ob-excl"
          rows={3}
          className={fieldClass}
          value={exclusions}
          onChange={(e) => setExclusions(e.target.value)}
        />
      </Field>
      <Field label="Desired output" htmlFor="ob-out">
        <input
          id="ob-out"
          required
          className={fieldClass}
          value={v.desiredOutput}
          onChange={set("desiredOutput")}
        />
      </Field>
      {err && (
        <p role="alert" className="text-sm text-bad">
          {err}
        </p>
      )}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save and continue"}
        </Button>
      </div>
    </form>
  );
}
