/**
 * Drizzle mirror of drizzle/*.sql — the SQL is authoritative; drift between
 * the two is caught by the PGlite tests, which apply the real SQL and query
 * through this schema (SPEC §10 migration safety).
 */
import {
  date,
  jsonb,
  pgTable,
  text,
  timestamp,
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
  activityTypes: jsonb("activity_types").$type<string[]>().notNull().default([]),
  usesAi: text("uses_ai").notNull().default(""),
  aiUseCase: text("ai_use_case").notNull().default(""),
  businessOwner: text("business_owner").notNull().default(""),
  technicalOwner: text("technical_owner").notNull().default(""),
  collaborators: text("collaborators").notNull().default(""),
  relatedAssessments: text("related_assessments").notNull().default(""),
  initiativeType: text("initiative_type").notNull().default(""),
  priorAssessmentRef: text("prior_assessment_ref").notNull().default(""),
  businessUnit: text("business_unit").notNull().default(""),
  otherUnits: text("other_units").notNull().default(""),
  targetGoLive: date("target_go_live"),
  vendorNames: text("vendor_names").notNull().default(""),
  coupaOnboarded: text("coupa_onboarded").notNull().default(""),
  dataClassification: jsonb("data_classification")
    .$type<string[]>()
    .notNull()
    .default([]),
  dataElements: jsonb("data_elements").$type<string[]>().notNull().default([]),
});

export type ProjectRow = typeof projects.$inferSelect;
