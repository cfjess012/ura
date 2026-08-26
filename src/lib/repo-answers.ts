/**
 * The answer store: every recorded answer, and the rule for which one is in
 * force (§5.1, NFR-1).
 *
 * Split out of `repo.ts`, which had passed the NFR-6 hard cap again — the
 * same move S8 made for `repo-review.ts`, and the same seam: callers import
 * `answerStore()` and never see a query, so swapping the driver stays a
 * one-file change (§26.1).
 */
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";

/**
 * A recorded answer, in the shape the instrument stores it.
 *
 * Tiers 1 and 2 store a string or a list. Tier 3 stores an answer AND the
 * note that goes with it, because the note is part of the answer — a "No"
 * without its explanation is not a finding anyone can act on (§3.4). The
 * column is jsonb and always has been; this type was narrower than the
 * column, so an object came back as the string "[object Object]" and the
 * answer silently failed to reload (S6, 2026-08-23).
 */
export type AnswerValue = string | string[] | Record<string, unknown>;

/**
 * Which answer is in force, for rows arriving newest-first: the first one
 * seen wins. The table is insert-only (§5.1), so "current" is a reading of
 * the history rather than a column — and it is a reading every caller has
 * to make the same way. Written once here because the batched read grew a
 * second copy of it, and a shared rule is only shared if every caller calls
 * it (S9 verification).
 */
function inForce(
  latest: Record<string, CurrentAnswer>,
  row: typeof schema.answers.$inferSelect,
): void {
  if (latest[row.questionId]) return;
  latest[row.questionId] = {
    // jsonb in, jsonb out. Coercing with String() flattened every object
    // answer to "[object Object]".
    value:
      typeof row.value === "object" && row.value !== null
        ? (row.value as AnswerValue)
        : String(row.value),
    source: row.source,
    confirmed: row.confirmed,
    basis: row.basis,
    sourceQuote: row.sourceQuote,
    sourceRef: row.sourceRef,
  };
}

export type CurrentAnswer = {
  value: AnswerValue;
  source: string;
  confirmed: boolean;
  /** Present only on a drafted answer: the passage it came from. */
  basis?: string | null;
  sourceQuote?: string | null;
  sourceRef?: string | null;
};

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
   * The same answers, for several assessments at once.
   *
   * The requester's listing works out where each of their assessments
   * stands, and that reasons from the answers in force. One query for the
   * page rather than one per row — and it settles "which answer is in
   * force" through the SAME rule as `current`, because two readings of an
   * insert-only table that disagree is exactly the defect §5.1 exists to
   * prevent.
   */
  currentFor(
    projectIds: string[],
  ): Promise<Map<string, Record<string, CurrentAnswer>>>;
  /**
   * How many times each question has been answered. The table is
   * insert-only, so this is a count of rows — and it is the only way the
   * review rubric can honestly say whether somebody kept changing their
   * mind. It was hardcoded to 1 once, under a heading promising mechanical
   * checks; that is the failure mode this exists to prevent.
   */
  timesAnswered(projectId: string): Promise<Map<string, number>>;
  /**
   * Record answers a model proposed. Always unconfirmed and always
   * carrying the passage they came from — the schema refuses anything
   * else (migration 0023).
   */
  recordDrafts(
    inputs: Array<{
      projectId: string;
      questionId: string;
      value: string | string[];
      basis: string;
      sourceQuote: string;
      sourceRef: string;
      instrumentVersionId: string;
    }>,
  ): Promise<void>;
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

export function postgresAnswerStore(): AnswerStore {
  const db = getDb();
  return {
    async recordDrafts(inputs) {
      if (inputs.length === 0) return;
      await db.insert(schema.answers).values(
        inputs.map((input) => ({
          projectId: input.projectId,
          questionId: input.questionId,
          value: input.value,
          source: "drafted",
          confirmed: false,
          basis: input.basis,
          sourceQuote: input.sourceQuote,
          sourceRef: input.sourceRef,
          instrumentVersionId: input.instrumentVersionId,
          answeredBy: null,
        })),
      );
    },
    async timesAnswered(projectId) {
      const rows = await db
        .select({
          questionId: schema.answers.questionId,
          times: sql<number>`count(*)::int`,
        })
        .from(schema.answers)
        .where(eq(schema.answers.projectId, projectId))
        .groupBy(schema.answers.questionId);
      return new Map(rows.map((row) => [row.questionId, Number(row.times)]));
    },
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
      for (const row of rows) inForce(latest, row);
      return latest;
    },
    async currentFor(projectIds) {
      const found = new Map<string, Record<string, CurrentAnswer>>();
      // Asked for nothing, answers nothing — `inArray` with an empty list
      // is a SQL error in some drivers and a full table scan in others.
      if (projectIds.length === 0) return found;
      const rows = await db
        .select()
        .from(schema.answers)
        .where(inArray(schema.answers.projectId, projectIds))
        .orderBy(desc(schema.answers.createdAt));
      for (const id of projectIds) found.set(id, {});
      for (const row of rows) {
        const latest = found.get(row.projectId);
        if (latest) inForce(latest, row);
      }
      return found;
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

export function answerStore(): AnswerStore {
  return postgresAnswerStore();
}

