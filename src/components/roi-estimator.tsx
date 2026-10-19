"use client";

import { useId, useState } from "react";
import { fieldClass } from "./ui";

/**
 * Editable ROI estimate from the visitor's own assumptions. Output is
 * labelled an estimate; nothing here is a measured or promised saving.
 * Example: 8 h/week researching at $90/h, MissionControl handling 60% of the
 * research and review taking 1.5 h/week -> (8×0.6 − 1.5) × 90 × 4.33 ≈ $1,286/month.
 */
export function RoiEstimator() {
  const [hours, setHours] = useState(8);
  const [rate, setRate] = useState(90);
  const [share, setShare] = useState(60);
  const [review, setReview] = useState(1.5);
  const id = useId();
  const saved = Math.max(0, hours * (share / 100) - review);
  const monthly = Math.round(saved * rate * 4.33);
  const input = (
    label: string,
    value: number,
    set: (n: number) => void,
    opts: { min: number; max: number; step: number; suffix: string },
  ) => (
    <div>
      <label
        htmlFor={`${id}-${label}`}
        className="mb-1 block text-xs font-medium text-ink-2"
      >
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`${id}-${label}`}
          type="number"
          inputMode="decimal"
          min={opts.min}
          max={opts.max}
          step={opts.step}
          value={value}
          onChange={(e) =>
            set(
              Math.min(
                opts.max,
                Math.max(opts.min, Number(e.target.value) || 0),
              ),
            )
          }
          className={fieldClass}
        />
        <span className="w-16 text-xs text-muted">{opts.suffix}</span>
      </div>
    </div>
  );
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_auto]">
      <div className="grid gap-4 sm:grid-cols-2">
        {input("Founder hours on prospect research", hours, setHours, {
          min: 0,
          max: 60,
          step: 0.5,
          suffix: "h / week",
        })}
        {input("Value of an hour of your time", rate, setRate, {
          min: 0,
          max: 1000,
          step: 5,
          suffix: "USD",
        })}
        {input("Share of that research you'd delegate", share, setShare, {
          min: 0,
          max: 100,
          step: 5,
          suffix: "%",
        })}
        {input("Time you'll spend reviewing & approving", review, setReview, {
          min: 0,
          max: 40,
          step: 0.5,
          suffix: "h / week",
        })}
      </div>
      <div
        className="flex min-w-56 flex-col justify-center rounded-xl bg-accent-soft p-5"
        aria-live="polite"
      >
        <div className="text-xs font-medium text-accent">Your estimate</div>
        <div className="mt-1 font-mono text-3xl font-semibold tabular-nums text-ink">
          {saved.toFixed(1)} h/wk
        </div>
        <div className="font-mono text-sm tabular-nums text-ink-2">
          ≈ ${monthly.toLocaleString()} / month of your time
        </div>
        <p className="mt-3 text-xs text-muted">
          Estimate from your inputs only — not a measured or guaranteed saving.
        </p>
      </div>
    </div>
  );
}
