import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * MissionControl schema.
 *
 * Rules applied throughout:
 *  - Every tenant-owned row carries `organization_id`; services always filter by
 *    it (see src/server/authz.ts). Example: a lead from org A is invisible to a
 *    query scoped to org B even if the caller guesses its UUID.
 *  - Deleting an organization cascades to all its data (tenant data deletion).
 *  - Status columns are explicit Postgres enums so invalid states cannot be
 *    stored, e.g. a task can never be "done" — only "succeeded".
 */

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const orgRef = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });

// ---------- enums ----------
export const roleEnum = pgEnum("member_role", ["owner", "admin", "member"]);
export const missionStatusEnum = pgEnum("mission_status", [
  "draft",
  "queued",
  "running",
  "paused",
  "needs_approval",
  "blocked",
  "succeeded",
  "failed",
  "cancelled",
]);
export const missionModeEnum = pgEnum("mission_mode", ["demo", "live"]);
export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "queued",
  "running",
  "waiting",
  "needs_approval",
  "blocked",
  "retrying",
  "succeeded",
  "failed",
  "cancelled",
]);
export const eventTypeEnum = pgEnum("agent_event_type", [
  "status",
  "assignment",
  "handoff",
  "artifact",
  "review",
  "approval",
  "export",
  "summary",
  "error",
  "human",
]);
export const leadStatusEnum = pgEnum("lead_status", [
  "qualified",
  "needs_review",
  "rejected",
  "duplicate",
  "approved",
  "exported",
]);
export const draftStatusEnum = pgEnum("draft_status", [
  "draft",
  "needs_revision",
  "ready",
  "approved",
  "rejected",
  "superseded",
]);
export const verdictEnum = pgEnum("review_verdict", [
  "pass",
  "revise",
  "block",
]);
export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "revision_requested",
  "superseded",
]);
export const decisionEnum = pgEnum("approval_decision", [
  "approve",
  "reject",
  "request_revision",
]);
export const providerEnum = pgEnum("integration_provider", [
  "rocketride",
  "masky",
  "n8n",
  "research",
  "sandbox",
  "llm",
  "snyk",
]);
export const integrationStatusEnum = pgEnum("integration_status", [
  "connected",
  "not_configured",
  "mock",
  "degraded",
  "error",
]);
export const deliveryStateEnum = pgEnum("delivery_state", [
  "pending",
  "delivering",
  "delivered",
  "failed",
  "dead",
]);
export const deliveryModeEnum = pgEnum("delivery_mode", ["mock", "live"]);
export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "dead",
]);

// ---------- identity & tenancy ----------
export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isDemo: boolean("is_demo").notNull().default(false),
  monthlyMissionLimit: integer("monthly_mission_limit").notNull().default(25),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  authProvider: text("auth_provider").notNull().default("local"),
  authSubject: text("auth_subject").unique(),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Only a SHA-256 of the cookie token is stored, so a DB leak cannot be
    // replayed as a live session.
    tokenHash: text("token_hash").notNull().unique(),
    activeOrganizationId: uuid("active_organization_id").references(
      () => organizations.id,
      { onDelete: "set null" },
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: id(),
    organizationId: orgRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("membership_org_user_uq").on(t.organizationId, t.userId)],
);

export const invitations = pgTable("invitations", {
  id: id(),
  organizationId: orgRef(),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("member"),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: uuid("invited_by").references(() => users.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Founder onboarding answers; the defaults every new mission starts from. */
export const workspaceProfiles = pgTable("workspace_profiles", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  productDescription: text("product_description").notNull(),
  icp: text("icp").notNull(),
  geography: text("geography").notNull(),
  exclusions: jsonb("exclusions").$type<string[]>().notNull().default([]),
  tone: text("tone").notNull().default("professional, concise"),
  desiredOutput: text("desired_output")
    .notNull()
    .default("qualified leads with evidence and editable outreach drafts"),
  updatedAt: updatedAt(),
});

// ---------- agents ----------
export type ToolPermission =
  | "research.read"
  | "sandbox.run_reviewed"
  | "leads.write"
  | "drafts.write"
  | "review.write"
  | "tasks.plan"
  | "approvals.request"
  | "export.n8n_after_approval";

export const agentProfiles = pgTable(
  "agent_profiles",
  {
    id: id(),
    organizationId: orgRef(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    title: text("title").notNull(),
    character: text("character").notNull(),
    responsibility: text("responsibility").notNull(),
    // Provider references are separate from our slug so a Masky avatar can be
    // swapped without touching mission logic.
    avatarProvider: text("avatar_provider").notNull().default("local"),
    avatarRef: text("avatar_ref"),
    voiceProvider: text("voice_provider").notNull().default("browser_tts"),
    voiceRef: text("voice_ref"),
    language: text("language").notNull().default("en-US"),
    accentColor: text("accent_color").notNull(),
    toolPermissions: jsonb("tool_permissions")
      .$type<ToolPermission[]>()
      .notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("agent_org_slug_uq").on(t.organizationId, t.slug)],
);

// ---------- missions & task graph ----------
export const missions = pgTable(
  "missions",
  {
    id: id(),
    organizationId: orgRef(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    goal: text("goal").notNull(),
    productContext: text("product_context").notNull(),
    icp: text("icp").notNull(),
    geography: text("geography").notNull(),
    exclusions: jsonb("exclusions").$type<string[]>().notNull().default([]),
    deliverables: jsonb("deliverables").$type<string[]>().notNull().default([]),
    dataConstraints: text("data_constraints").notNull().default(""),
    requestedCount: integer("requested_count").notNull(),
    seedDomains: jsonb("seed_domains").$type<string[]>().notNull().default([]),
    status: missionStatusEnum("status").notNull().default("draft"),
    progress: integer("progress").notNull().default(0),
    mode: missionModeEnum("mode").notNull().default("demo"),
    isSample: boolean("is_sample").notNull().default(false),
    orchestrator: text("orchestrator").notNull().default("demo"),
    externalRunId: text("external_run_id"),
    summary: jsonb("summary").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("missions_org_recent_idx").on(t.organizationId, t.createdAt.desc()),
  ],
);

export const missionTasks = pgTable(
  "mission_tasks",
  {
    id: id(),
    organizationId: orgRef(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    agentSlug: text("agent_slug").notNull(),
    taskType: text("task_type").notNull(),
    title: text("title").notNull(),
    status: taskStatusEnum("status").notNull().default("pending"),
    input: jsonb("input")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    output: jsonb("output").$type<Record<string, unknown>>(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    errorClass: text("error_class"),
    errorMessage: text("error_message"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    position: integer("position").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("tasks_mission_status_idx").on(t.missionId, t.status)],
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    organizationId: orgRef(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => missionTasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: uuid("depends_on_task_id")
      .notNull()
      .references(() => missionTasks.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.dependsOnTaskId] })],
);

/**
 * User-safe activity feed. Stores concise status lines and structured data
 * (handoff artifacts, counts) — never hidden model reasoning.
 * `seq` is monotonic so SSE clients resume with Last-Event-ID.
 */
export const agentEvents = pgTable(
  "agent_events",
  {
    seq: bigint("seq", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    organizationId: orgRef(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => missionTasks.id, {
      onDelete: "set null",
    }),
    agentSlug: text("agent_slug"),
    toAgentSlug: text("to_agent_slug"),
    type: eventTypeEnum("type").notNull(),
    message: text("message").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("events_mission_seq_idx").on(t.missionId, t.seq)],
);

// ---------- research artifacts ----------
export type LeadFact = {
  claim: string;
  kind: "observed" | "inference";
  evidenceIds: string[];
  key?: string; // rubric criterion this fact supports, e.g. "support_pain"
};

export type ScoreBreakdown = {
  criterion: string;
  points: number;
  max: number;
  reason: string;
  evidenceIds: string[];
}[];

export const leads = pgTable(
  "leads",
  {
    id: id(),
    organizationId: orgRef(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    domain: text("domain"),
    dedupeKey: text("dedupe_key").notNull(),
    duplicateOfLeadId: uuid("duplicate_of_lead_id"),
    score: integer("score").notNull(),
    scoreBreakdown: jsonb("score_breakdown").$type<ScoreBreakdown>().notNull(),
    rationale: text("rationale").notNull(),
    status: leadStatusEnum("status").notNull(),
    stage: text("stage").notNull().default("researched"),
    confidence: real("confidence").notNull(),
    facts: jsonb("facts").$type<LeadFact[]>().notNull().default([]),
    segment: text("segment"),
    location: text("location"),
    employeeRange: text("employee_range"),
    isSample: boolean("is_sample").notNull().default(false),
    version: integer("version").notNull().default(1),
    currentDraftId: uuid("current_draft_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("leads_org_mission_idx").on(t.organizationId, t.missionId),
    // Dedupe within an organization only among non-duplicate rows: a second
    // mission can record "already in pipeline" rows without violating this.
    uniqueIndex("leads_org_dedupe_uq")
      .on(t.organizationId, t.dedupeKey)
      .where(sql`status <> 'duplicate'`),
  ],
);

export const evidenceSources = pgTable(
  "evidence_sources",
  {
    id: id(),
    organizationId: orgRef(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    excerpt: text("excerpt").notNull(),
    claim: text("claim"),
    contentHash: text("content_hash"),
    confidence: real("confidence").notNull(),
    // Retrieved text looked like instructions to an AI ("ignore previous
    // instructions…"). Stored for reviewers; never fed to a model as a command.
    injectionSuspected: boolean("injection_suspected").notNull().default(false),
    provider: text("provider").notNull(),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("evidence_lead_idx").on(t.leadId),
    index("evidence_mission_idx").on(t.missionId),
  ],
);

export type Personalization = {
  text: string;
  kind: "observed" | "inference";
  evidenceIds: string[];
};

export const outreachDrafts = pgTable(
  "outreach_drafts",
  {
    id: id(),
    organizationId: orgRef(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    personalizations: jsonb("personalizations")
      .$type<Personalization[]>()
      .notNull()
      .default([]),
    status: draftStatusEnum("status").notNull().default("draft"),
    revisionOfId: uuid("revision_of_id"),
    authorAgent: text("author_agent"),
    editedByUserId: uuid("edited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    generator: text("generator").notNull().default("demo-template"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("draft_lead_version_uq").on(t.leadId, t.version)],
);

export type Finding = {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  target: "lead" | "draft";
  ref?: string;
};

/** Sam's reviews are append-only: there is no update path, by design. */
export const reviewFindings = pgTable(
  "review_findings",
  {
    id: id(),
    organizationId: orgRef(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id").references(() => outreachDrafts.id, {
      onDelete: "cascade",
    }),
    round: integer("round").notNull().default(1),
    verdict: verdictEnum("verdict").notNull(),
    findings: jsonb("findings").$type<Finding[]>().notNull(),
    reviewerAgent: text("reviewer_agent").notNull().default("sam"),
    createdAt: createdAt(),
  },
  (t) => [index("review_lead_idx").on(t.leadId)],
);

// ---------- approvals ----------
export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: id(),
    organizationId: orgRef(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    action: text("action").notNull().default("export_lead"),
    destination: text("destination").notNull(),
    // Immutable snapshot + SHA-256: an approval is valid only for this exact
    // payload. Editing the lead or draft produces a new hash, making the old
    // approval stale (see features/approval-policy.ts).
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    payloadHash: text("payload_hash").notNull(),
    payloadVersion: integer("payload_version").notNull(),
    status: approvalStatusEnum("status").notNull().default("pending"),
    requestedByAgent: text("requested_by_agent").notNull().default("alex"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("approvals_org_status_idx").on(
      t.organizationId,
      t.status,
      t.createdAt,
    ),
  ],
);

export const approvalDecisions = pgTable("approval_decisions", {
  id: id(),
  organizationId: orgRef(),
  approvalRequestId: uuid("approval_request_id")
    .notNull()
    .references(() => approvalRequests.id, { onDelete: "cascade" }),
  decision: decisionEnum("decision").notNull(),
  reason: text("reason"),
  payloadHash: text("payload_hash").notNull(),
  decidedBy: uuid("decided_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
});

// ---------- integrations & outbox ----------
export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: id(),
    organizationId: orgRef(),
    provider: providerEnum("provider").notNull(),
    status: integrationStatusEnum("status").notNull().default("not_configured"),
    // Non-secret settings only (e.g. webhook host, workspace id).
    config: jsonb("config")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    // AES-256-GCM ciphertext; never returned by any API.
    secretCiphertext: text("secret_ciphertext"),
    secretKeyVersion: integer("secret_key_version"),
    lastHealthCheckAt: timestamp("last_health_check_at", {
      withTimezone: true,
    }),
    lastHealthMessage: text("last_health_message"),
    testedOk: boolean("tested_ok").notNull().default(false),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("integration_org_provider_uq").on(t.organizationId, t.provider),
  ],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    organizationId: orgRef(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    approvalRequestId: uuid("approval_request_id")
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull().default("lead.approved"),
    // approvalId:payloadHash — the same approved payload can never be
    // delivered twice, even if the export button is pressed repeatedly.
    idempotencyKey: text("idempotency_key").notNull().unique(),
    payloadHash: text("payload_hash").notNull(),
    destination: text("destination").notNull(),
    mode: deliveryModeEnum("mode").notNull(),
    state: deliveryStateEnum("state").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    responseSummary: text("response_summary"),
    lastError: text("last_error"),
    externalRef: text("external_ref"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("deliveries_retry_idx").on(t.state, t.nextAttemptAt)],
);

/** Inbound webhook replay protection: each event id is accepted once. */
export const webhookReceipts = pgTable("webhook_receipts", {
  id: id(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull().unique(),
  receivedAt: createdAt(),
});

// ---------- durable job queue ----------
export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    dedupeKey: text("dedupe_key").unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("jobs_ready_idx").on(t.status, t.runAt)],
);

// ---------- audit, usage, analytics ----------
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    correlationId: text("correlation_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_org_recent_idx").on(t.organizationId, t.createdAt.desc()),
  ],
);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: id(),
    organizationId: orgRef(),
    metric: text("metric").notNull(),
    quantity: integer("quantity").notNull().default(1),
    period: text("period").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("usage_org_period_idx").on(t.organizationId, t.period, t.metric),
  ],
);

/** Privacy-minimized product analytics: event names + small enum-like props, no PII. */
export const productEvents = pgTable(
  "product_events",
  {
    id: id(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    properties: jsonb("properties")
      .$type<Record<string, string | number | boolean>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (t) => [index("product_events_name_idx").on(t.name, t.createdAt)],
);

export const waitlistEntries = pgTable("waitlist_entries", {
  id: id(),
  email: text("email").notNull().unique(),
  company: text("company"),
  role: text("role"),
  createdAt: createdAt(),
});

export type Mission = typeof missions.$inferSelect;
export type MissionTask = typeof missionTasks.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Evidence = typeof evidenceSources.$inferSelect;
export type Draft = typeof outreachDrafts.$inferSelect;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type AgentEvent = typeof agentEvents.$inferSelect;
export type AgentProfile = typeof agentProfiles.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type MissionStatus = (typeof missionStatusEnum.enumValues)[number];
export type IntegrationStatus =
  (typeof integrationStatusEnum.enumValues)[number];
export type Provider = (typeof providerEnum.enumValues)[number];
