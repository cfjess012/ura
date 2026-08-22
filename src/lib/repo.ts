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
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { IntakeChange, IntakePatch } from "./intake-values";
import type { Person, Role } from "./people";
import { labelOf, type ReferenceAnswer } from "./reference";

export type ProjectSummary = {
  id: string;
  projectName: string;
  /** The label as it was chosen, or null — never re-read from today's list. */
  businessUnit: string | null;
  updatedAt: Date;
  /** Who started it. Null for rows created before people existed. */
  startedBy: string | null;
};

/**
 * Which assessments a listing covers. `createdBy` narrows it to one person's
 * own work; omitting it means everyone's, which only a reviewer or an
 * administrator may ask for (see `seesEveryAssessment`).
 */
export type ProjectScope = { createdBy?: string; limit?: number };

/** The last attributed change to a project's intake (F5). */
export type LastIntakeChange = { byName: string | null; at: Date };

export type ProjectRecord = typeof schema.projects.$inferSelect;

/**
 * The newest answer per question — answers are insert-only (NFR-1).
 *
 * `value` is a string for a single answer and a list for a multi-select
 * (Tier-1 path selections). Both are stored as JSON, so a list keeps its
 * shape instead of being flattened into text nobody can split reliably.
 */
export type CurrentAnswer = {
  value: string | string[];
  source: string;
  confirmed: boolean;
};

export interface PeopleStore {
  /**
   * Everyone the platform knows about, including the directory-only people
   * who exist to be *chosen* as an owner. Do not use this for sign-in.
   */
  list(): Promise<Person[]>;
  /**
   * Only the people who can be signed in as. The directory arrived with
   * S4.5 and every sign-in surface kept calling list(), so the front door
   * offered all fifteen — twelve of whom are not personas at all.
   */
  signIns(): Promise<Person[]>;
  get(id: string): Promise<Person | null>;
}

export type AnswerInput = {
  projectId: string;
  questionId: string;
  value: string | string[];
  source: "person" | "intake";
  confirmed: boolean;
  instrumentVersionId: string;
  answeredBy: string | null;
};

export interface AnswerStore {
  /** The active instrument version every answer pins to (NFR-11). */
  activeVersionId(slug: string): Promise<string>;
  current(projectId: string): Promise<Record<string, CurrentAnswer>>;
  /**
   * Record several answers as one act. All of them land or none do — a
   * screen that saves four areas in a loop can fail halfway, leaving two
   * committed while telling the person nothing was saved (found by
   * independent verification).
   */
  recordAll(inputs: AnswerInput[]): Promise<void>;
  record(input: {
    projectId: string;
    questionId: string;
    value: string | string[];
    source: "person" | "intake";
    confirmed: boolean;
    instrumentVersionId: string;
    /** Who recorded it. Null only for rows written before people existed. */
    answeredBy: string | null;
  }): Promise<void>;
}

export interface ProjectStore {
  list(scope: ProjectScope): Promise<ProjectSummary[]>;
  /** How many assessments the same scope covers, ignoring any limit. */
  count(scope: ProjectScope): Promise<number>;
  /**
   * How many assessments exist with no recorded owner. They predate
   * attribution and belong to nobody, so a scoped list cannot show them —
   * but omitting them silently makes a person's earlier work vanish with no
   * explanation (N11).
   */
  countUnattributed(): Promise<number>;
  get(id: string): Promise<ProjectRecord | null>;
  create(projectName: string, createdBy: string | null): Promise<{ id: string }>;
  /**
   * Apply an intake patch and record what moved, attributed to a person.
   * The two writes share a transaction: a change that is applied but not
   * recorded would be exactly the gap F5 found. Returns false when the
   * project no longer exists.
   */
  updateIntake(
    id: string,
    patch: IntakePatch,
    record: { changes: IntakeChange[]; changedBy: string | null },
  ): Promise<boolean>;
  lastIntakeChange(projectId: string): Promise<LastIntakeChange | null>;
}

export function postgresProjectStore(): ProjectStore {
  const db = getDb();
  return {
    async list(scope) {
      const query = db
        .select({
          id: schema.projects.id,
          projectName: schema.projects.projectName,
          businessUnit: schema.projects.businessUnit,
          updatedAt: schema.projects.updatedAt,
          startedBy: schema.people.name,
        })
        .from(schema.projects)
        .leftJoin(schema.people, eq(schema.people.id, schema.projects.createdBy))
        .where(scope.createdBy ? eq(schema.projects.createdBy, scope.createdBy) : undefined)
        .orderBy(desc(schema.projects.updatedAt));
      // No limit means no limit. A silent internal cap would be the same
      // quiet truncation F11 objected to, one layer down.
      const rows = await (scope.limit === undefined ? query : query.limit(scope.limit));
      // The stored label, never today's list — that is what makes a rename
      // safe (NFR-22).
      return rows.map((row) => ({
        ...row,
        businessUnit: row.businessUnit ? labelOf(row.businessUnit as ReferenceAnswer) : null,
      }));
    },
    async count(scope) {
      const [row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.projects)
        .where(scope.createdBy ? eq(schema.projects.createdBy, scope.createdBy) : undefined);
      return row?.total ?? 0;
    },
    async countUnattributed() {
      const [row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.projects)
        .where(isNull(schema.projects.createdBy));
      return row?.total ?? 0;
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
    async updateIntake(id, patch, record) {
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(schema.projects)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(schema.projects.id, id))
          .returning({ id: schema.projects.id });
        if (updated.length === 0) return false;
        if (record.changes.length > 0) {
          await tx.insert(schema.intakeEvents).values(
            record.changes.map((change) => ({
              projectId: id,
              fieldId: change.fieldId,
              previousValue: change.previousValue,
              value: change.value,
              changedBy: record.changedBy,
            })),
          );
        }
        return true;
      });
    },
    async lastIntakeChange(projectId) {
      const [row] = await db
        .select({ byName: schema.people.name, at: schema.intakeEvents.createdAt })
        .from(schema.intakeEvents)
        .leftJoin(schema.people, eq(schema.people.id, schema.intakeEvents.changedBy))
        .where(eq(schema.intakeEvents.projectId, projectId))
        .orderBy(desc(schema.intakeEvents.createdAt))
        .limit(1);
      return row ?? null;
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
          value: Array.isArray(row.value) ? (row.value as string[]) : String(row.value),
          source: row.source,
          confirmed: row.confirmed,
        };
      }
      return latest;
    },
    async record(input) {
      await db.insert(schema.answers).values(input);
    },
    async recordAll(inputs) {
      if (inputs.length === 0) return;
      // One statement, one transaction: partial success is the failure mode
      // this exists to remove.
      await db.insert(schema.answers).values(inputs);
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
    email: row.email,
    signsIn: row.signsIn,
    riskDomain: row.riskDomain,
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
    async signIns() {
      return (await this.list()).filter((person) => person.signsIn);
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
