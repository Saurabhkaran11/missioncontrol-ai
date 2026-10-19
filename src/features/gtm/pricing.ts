/**
 * Pricing hypotheses as configuration, not billing. No checkout exists; the
 * pricing page renders these with a prominent "hypothesis" label. Change the
 * numbers here to run a pricing-page experiment.
 */
export const PRICING_HYPOTHESES = {
  label: "Hypothesis pricing — not yet validated, no paid plans available",
  tiers: [
    {
      name: "Founder",
      price: "$49",
      period: "/ month",
      missions: "4 missions / month",
      leads: "Up to 25 leads per mission",
      seats: "1 seat",
      note: "Testing: is a solo founder willing to pay for supervised research at all?",
    },
    {
      name: "Team",
      price: "$149",
      period: "/ month",
      missions: "15 missions / month",
      leads: "Up to 50 leads per mission",
      seats: "5 seats, shared approvals",
      note: "Testing: does shared review make the product stickier for 3–10 person teams?",
    },
    {
      name: "Design partner",
      price: "Free",
      period: "for 90 days",
      missions: "Generous limits",
      leads: "Weekly feedback call",
      seats: "Up to 5 seats",
      note: "What we are actually offering today, in exchange for feedback.",
    },
  ],
  questions: [
    "Is value tied to missions run, leads approved, or seats?",
    "Would founders pay more for live CRM export than for research alone?",
    "What review time per lead feels acceptable?",
  ],
} as const;
