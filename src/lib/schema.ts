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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
    instrumentVersionId: uuid("instrument_version_id").notNull(),
    answeredBy: text("answered_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
  },
  (t) => [index("handoffs_by_project").on(t.projectId, t.createdAt)],
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("handoff_replies_by_handoff").on(t.handoffId, t.createdAt)],
);
