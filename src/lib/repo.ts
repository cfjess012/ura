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
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { IntakePatch } from "./intake-values";
import type { Person, Role } from "./people";

export type ProjectSummary = {
  id: string;
  projectName: string;
  businessUnit: string;
  updatedAt: Date;
};

export type ProjectRecord = typeof schema.projects.$inferSelect;

/** The newest answer per question — answers are insert-only (NFR-1). */
export type CurrentAnswer = { value: string; source: string; confirmed: boolean };

export interface PeopleStore {
  list(): Promise<Person[]>;
  get(id: string): Promise<Person | null>;
}

export interface AnswerStore {
  /** The active instrument version every answer pins to (NFR-11). */
  activeVersionId(slug: string): Promise<string>;
  current(projectId: string): Promise<Record<string, CurrentAnswer>>;
  record(input: {
    projectId: string;
    questionId: string;
    value: string;
    source: "person" | "intake";
    confirmed: boolean;
    instrumentVersionId: string;
    /** Who recorded it. Null only for rows written before people existed. */
    answeredBy: string | null;
  }): Promise<void>;
}

export interface ProjectStore {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<ProjectRecord | null>;
  create(projectName: string, createdBy: string | null): Promise<{ id: string }>;
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
    async create(projectName, createdBy) {
      const [row] = await db
        .insert(schema.projects)
        .values({ projectName, createdBy })
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

export function postgresAnswerStore(): AnswerStore {
  const db = getDb();
  return {
    async activeVersionId(slug) {
      const [row] = await db
        .select({ id: schema.instrumentVersions.id })
        .from(schema.instrumentVersions)
        .where(
          and(
            eq(schema.instrumentVersions.slug, slug),
            isNotNull(schema.instrumentVersions.activatedAt),
          ),
        )
        .orderBy(desc(schema.instrumentVersions.activatedAt))
        .limit(1);
      if (!row) {
        throw new Error(
          `No activated instrument version for "${slug}". Run: pnpm instrument:seed`,
        );
      }
      return row.id;
    },
    async current(projectId) {
      const rows = await db
        .select()
        .from(schema.answers)
        .where(eq(schema.answers.projectId, projectId))
        .orderBy(desc(schema.answers.createdAt));
      const latest: Record<string, CurrentAnswer> = {};
      for (const row of rows) {
        // Rows arrive newest-first; the first one seen wins.
        if (latest[row.questionId]) continue;
        latest[row.questionId] = {
          value: String(row.value),
          source: row.source,
          confirmed: row.confirmed,
        };
      }
      return latest;
    },
    async record(input) {
      await db.insert(schema.answers).values(input);
    },
  };
}

export function postgresPeopleStore(): PeopleStore {
  const db = getDb();
  const shape = (row: typeof schema.people.$inferSelect): Person => ({
    id: row.id,
    name: row.name,
    role: row.role as Role,
    title: row.title,
  });
  return {
    async list() {
      // Ordered by the journey — requester, then assessor, then admin —
      // because that is the story the front door tells.
      const order: Record<string, number> = { requester: 0, assessor: 1, admin: 2 };
      const rows = await db.select().from(schema.people);
      return rows
        .map(shape)
        .sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.name.localeCompare(b.name));
    },
    async get(id) {
      const [row] = await db.select().from(schema.people).where(eq(schema.people.id, id));
      return row ? shape(row) : null;
    },
  };
}

export function peopleStore(): PeopleStore {
  return postgresPeopleStore();
}

export function answerStore(): AnswerStore {
  return postgresAnswerStore();
}

/** The wiring point — the one line that changes when the store changes. */
export function projectStore(): ProjectStore {
  return postgresProjectStore();
}
