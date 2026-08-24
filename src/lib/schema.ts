/**
 * Drizzle mirror of drizzle/*.sql — the SQL is authoritative; drift between
 * the two is caught by the PGlite tests, which apply the real SQL and query
 * through this schema (SPEC §10 migration safety).
 */
import type { IntakeStored } from "./intake-values";
import {
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  projectName: text("project_name").notNull(),
  businessPurpose: text("business_purpose").notNull().default(""),
  projectDescription: text("project_description").notNull().default(""),
  usesAi: text("uses_ai").notNull().default(""),
  aiUseCase: text("ai_use_case").notNull().default(""),
  businessOwner: jsonb("business_owner"),
  technicalOwner: jsonb("technical_owner"),
  collaborators: text("collaborators").notNull().default(""),
  relatedAssessments: text("related_assessments").notNull().default(""),
  initiativeType: text("initiative_type").notNull().default(""),
  priorAssessmentRef: text("prior_assessment_ref").notNull().default(""),
  businessUnit: jsonb("business_unit"),
  otherUnits: jsonb("other_units").notNull().default([]),
  targetGoLive: date("target_go_live"),
  thirdPartyInvolved: text("third_party_involved").notNull().default(""),
  vendorNames: jsonb("vendor_names").notNull().default([]),
  coupaOnboarded: text("coupa_onboarded").notNull().default(""),
  dataClassification: text("data_classification").notNull().default(""),
  dataElements: jsonb("data_elements").$type<string[]>().notNull().default([]),
  createdBy: text("created_by"),
  /** Submission is a one-way fact, never a status somebody can set back. */
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submittedBy: text("submitted_by"),
});

export type ProjectRow = typeof projects.$inferSelect;

export const instrumentVersions = pgTable(
  "instrument_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    version: text("version").notNull(),
    content: jsonb("content").notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.slug, t.version)],
);

export const answers = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    questionId: text("question_id").notNull(),
    value: jsonb("value").$type<string | string[]>().notNull(),
    source: text("source").notNull(),
    confirmed: boolean("confirmed").notNull().default(false),
    // Provenance, present only on a drafted answer (migration 0023).
    basis: text("basis"),
    sourceQuote: text("source_quote"),
    sourceRef: text("source_ref"),
    instrumentVersionId: uuid("instrument_version_id").notNull(),
    answeredBy: text("answered_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("answers_current").on(t.projectId, t.questionId, t.createdAt)],
);

export type AnswerRow = typeof answers.$inferSelect;

export const people = pgTable("people", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  title: text("title").notNull().default(""),
  email: text("email").notNull().default(""),
  /** Only the personas sign in; the rest of the directory exists to be chosen. */
  signsIn: boolean("signs_in").notNull().default(false),
  /**
   * Which risk area this assessor owns — a category key from the Tier-1
   * instrument, or null. It is the routing table for a domain hand-off,
   * grounded in the eleven areas rather than a second taxonomy (S4.7).
   */
  riskDomain: text("risk_domain"),
  /** Everything before this has been read. News is derived, not stored. */
  newsClearedAt: timestamp("news_cleared_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const intakeEvents = pgTable(
  "intake_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    fieldId: text("field_id").notNull(),
    // Reference answers are objects, so the history column carries them too
    // — it already was jsonb, only the type was narrower than the data.
    previousValue: jsonb("previous_value").$type<IntakeStored>(),
    value: jsonb("value").$type<IntakeStored>(),
    changedBy: text("changed_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("intake_events_by_project").on(t.projectId, t.createdAt)],
);

export type IntakeEventRow = typeof intakeEvents.$inferSelect;

/** S4.7 — a question handed to a person or an office. */
export const handoffs = pgTable(
  "handoffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    questionId: text("question_id").notNull(),
    toPersonId: text("to_person_id"),
    toDomain: text("to_domain"),
    note: text("note").notNull().default(""),
    askedBy: text("asked_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
  },
  (t) => [index("handoffs_by_project").on(t.projectId, t.createdAt)],
);

/**
 * The submitter's declaration (FR-37, G-52) — distinct from the assessor's
 * attestation, which is S8's act against a different authority rule.
 */
export const declarations = pgTable(
  "declarations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    declaredBy: text("declared_by").notNull(),
    declaredAt: timestamp("declared_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The answers as displayed at the moment of signing. */
    shown: jsonb("shown").notNull(),
    /** The gaps named and accepted at the same moment (FR-14). */
    gaps: jsonb("gaps").notNull().default([]),
  },
  (t) => [index("declarations_by_project").on(t.projectId, t.declaredAt)],
);

/** Synthesised from Tier-3 answers at submission (FR-15). Insert-only. */
export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    questionId: text("question_id").notNull(),
    objective: text("objective").notNull(),
    objectiveName: text("objective_name").notNull(),
    /** "gap" from a No, "enhancement" from a Partial (§4.3). */
    kind: text("kind").notNull(),
    note: text("note").notNull(),
    raisedAt: timestamp("raised_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    raisedBy: text("raised_by").notNull(),
    // Present only on a non-compliance: the clause it breaches (0024).
    policyRef: text("policy_ref"),
    policyVersion: text("policy_version"),
    clauseId: text("clause_id"),
    clauseText: text("clause_text"),
    expected: text("expected"),
  },
  (t) => [index("findings_by_project").on(t.projectId, t.raisedAt)],
);

/** A reviewer's sign-off on one Tier-3 answer (S8, FR-16/FR-17). */
export const attestations = pgTable(
  "attestations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    questionId: text("question_id").notNull(),
    attestedBy: text("attested_by").notNull(),
    /** The risk area they signed under — authority is a fact about them. */
    attestedDomain: text("attested_domain"),
    attestedAt: timestamp("attested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    act: text("act").notNull(),
    correctedAnswer: text("corrected_answer"),
    note: text("note").notNull().default(""),
  },
  (t) => [index("attestations_by_project").on(t.projectId, t.attestedAt)],
);

/**
 * How a finding was settled (§4.3). Never an edit of the finding: the
 * history of how a gap was closed survives intact, and four-eyes is a CHECK
 * constraint rather than application code (G-59).
 */
export const dispositions = pgTable(
  "dispositions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    findingId: uuid("finding_id").notNull(),
    kind: text("kind").notNull(),
    resolvedBy: text("resolved_by").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    note: text("note").notNull().default(""),
    remediationOwner: text("remediation_owner"),
    remediationDue: timestamp("remediation_due", { withTimezone: true }),
    acceptedBy: text("accepted_by"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [index("dispositions_by_finding").on(t.findingId, t.resolvedAt)],
);

/** The conversation that settles a hand-off. Threaded, insert-only. */
export const handoffReplies = pgTable(
  "handoff_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    handoffId: uuid("handoff_id").notNull(),
    parentId: uuid("parent_id"),
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("handoff_replies_by_handoff").on(t.handoffId, t.createdAt)],
);

/**
 * Documents a requester supplied. Text only — the file itself is never
 * stored (§3.6 is open and blocks attachments; extracted text scoped to one
 * assessment is a narrower thing than a binary store).
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    name: text("name").notNull(),
    body: text("body").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("documents_by_project").on(t.projectId, t.uploadedAt)],
);

/**
 * Conversation state (Phase 2). Read and written only through
 * `src/lib/session.ts` — the seam that becomes AgentCore Memory.
 */
export const conversationTurns = pgTable(
  "conversation_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: text("conversation_id").notNull(),
    projectId: uuid("project_id").notNull(),
    speaker: text("speaker").notNull(),
    said: text("said").notNull(),
    saidAt: timestamp("said_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("conversation_turns_by_conversation").on(t.conversationId, t.saidAt),
    index("conversation_turns_by_project").on(t.projectId, t.saidAt),
  ],
);
