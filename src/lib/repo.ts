/**
 * The persistence boundary (SPEC §26.2). Every read and write goes through
 * this interface; no route, action, or component touches the database
 * driver directly.
 *
 * Why an interface rather than "just use Drizzle": the store is expected to
 * change (RDS today, a managed or serverless store later). An interface
 * makes that a new implementation plus a wiring change instead of an
 * archaeology exercise across the codebase.
 *
 * Honest scope note: this makes the swap *contained*, not free. A different
 * store with a different query model still needs a real implementation —
 * what this guarantees is that only this file and its wiring change.
 */
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { IntakePatch } from "./intake-values";

export type ProjectSummary = {
  id: string;
  projectName: string;
  businessUnit: string;
  updatedAt: Date;
};

export type ProjectRecord = typeof schema.projects.$inferSelect;

export interface ProjectStore {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<ProjectRecord | null>;
  create(projectName: string): Promise<{ id: string }>;
  /** Returns false when the project no longer exists. */
  updateIntake(id: string, patch: IntakePatch): Promise<boolean>;
}

export function postgresProjectStore(): ProjectStore {
  const db = getDb();
  return {
    async list() {
      return db
        .select({
          id: schema.projects.id,
          projectName: schema.projects.projectName,
          businessUnit: schema.projects.businessUnit,
          updatedAt: schema.projects.updatedAt,
        })
        .from(schema.projects)
        .orderBy(desc(schema.projects.updatedAt));
    },
    async get(id) {
      const [row] = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, id));
      return row ?? null;
    },
    async create(projectName) {
      const [row] = await db
        .insert(schema.projects)
        .values({ projectName })
        .returning({ id: schema.projects.id });
      return row!;
    },
    async updateIntake(id, patch) {
      const updated = await db
        .update(schema.projects)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.projects.id, id))
        .returning({ id: schema.projects.id });
      return updated.length > 0;
    },
  };
}

/** The wiring point — the one line that changes when the store changes. */
export function projectStore(): ProjectStore {
  return postgresProjectStore();
}
