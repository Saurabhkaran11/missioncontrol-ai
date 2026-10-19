import { z } from "zod";

/** Runtime schemas for every API input. Bounds keep payloads and costs predictable. */
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const list = (maxItems: number, maxLen = 200) =>
  z.array(z.string().trim().min(1).max(maxLen)).max(maxItems);

export const MissionInput = z.object({
  title: text(3, 120).optional(),
  goal: text(10, 2000),
  productContext: text(10, 2000),
  icp: text(5, 1000),
  geography: text(2, 200),
  exclusions: list(20).default([]),
  deliverables: list(10).default([
    "Qualified leads with evidence",
    "Editable outreach drafts",
    "Validation report",
  ]),
  dataConstraints: text(0, 1000).default(
    "Public business information only. No personal contact details. No messages are sent.",
  ),
  requestedCount: z.number().int().min(1).max(50),
  seedDomains: list(20, 253).default([]),
  autoStart: z.boolean().default(true),
});
export type MissionInput = z.infer<typeof MissionInput>;

export const OnboardingInput = z.object({
  companyName: text(2, 120),
  productDescription: text(10, 2000),
  icp: text(5, 1000),
  geography: text(2, 200),
  exclusions: list(20).default([]),
  tone: text(2, 200),
  desiredOutput: text(2, 300),
});

export const LeadPatch = z
  .object({
    companyName: text(1, 200).optional(),
    domain: text(3, 253).nullable().optional(),
    rationale: text(1, 1000).optional(),
    status: z.enum(["qualified", "rejected", "needs_review"]).optional(),
    draft: z.object({ subject: text(1, 200), body: text(1, 5000) }).optional(),
    expectedVersion: z.number().int().positive(),
  })
  .refine((v) => Object.keys(v).length > 1, "Nothing to update");

export const ApprovalDecisionInput = z
  .object({
    decision: z.enum(["approve", "reject", "request_revision"]),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    reason: text(0, 1000).optional(),
  })
  .refine(
    (v) => v.decision === "approve" || (v.reason && v.reason.length >= 3),
    {
      message: "A reason is required to reject or request revision",
      path: ["reason"],
    },
  );

export const BulkDecisionInput = z.object({
  items: z
    .array(
      z.object({
        approvalId: z.string().uuid(),
        payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .min(1)
    .max(50),
  decision: z.enum(["approve", "reject"]),
  reason: text(0, 1000).optional(),
  confirm: z.literal(true),
});

export const ExportInput = z.object({ missionId: z.string().uuid() });

export const IntegrationUpdate = z.object({
  webhookUrl: z.string().url().max(500).optional(),
  baseUrl: z.string().url().max(500).optional(),
  secret: z.string().min(16).max(500).optional(),
});

export const InviteInput = z.object({
  email: z.string().email().max(254),
  role: z.enum(["admin", "member"]),
});
export const WaitlistInput = z.object({
  email: z.string().email().max(254),
  company: text(0, 120).optional(),
  role: text(0, 120).optional(),
});
export const DevLoginInput = z.object({
  email: z.string().email().max(254),
  name: text(1, 80),
});
