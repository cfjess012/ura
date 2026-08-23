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
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { IntakeChange, IntakePatch } from "./intake-values";
import type { Person, Role } from "./people";
import { labelOf, type ReferenceAnswer } from "./reference";
import { CATEGORIES } from "./instrument";
import { isWaitingOn, type Handoff, type Reply } from "./handoff";
import type { Declared, Gap, SynthesisedFinding } from "./submission";
import { questionLabelFor } from "./question-label";

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

export type CurrentAnswer = {
  value: AnswerValue;
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
          // jsonb in, jsonb out. Coercing with String() flattened every
          // object answer to "[object Object]".
          value:
            typeof row.value === "object" && row.value !== null
              ? (row.value as AnswerValue)
              : String(row.value),
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
    newsClearedAt: row.newsClearedAt,
  });
  return {
    async list() {
      // Ordered by the journey — requester, then assessor, then admin —
      // because that is the story the front door tells.
      //
      // Within the assessors the order is the INSTRUMENT'S, not the
      // alphabet's: a requester looking for who owns privacy is scanning
      // risk areas, and the areas already have an order that the whole
      // product uses. The generalist sits last, after every named owner.
      const order: Record<string, number> = { requester: 0, assessor: 1, admin: 2 };
      const domainOrder = new Map(CATEGORIES.map((c, i) => [c.key, i]));
      const byDomain = (person: Person) =>
        person.riskDomain ? (domainOrder.get(person.riskDomain) ?? 998) : 999;
      const rows = await db.select().from(schema.people);
      return rows
        .map(shape)
        .sort(
          (a, b) =>
            (order[a.role] ?? 9) - (order[b.role] ?? 9) ||
            byDomain(a) - byDomain(b) ||
            a.name.localeCompare(b.name),
        );
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

/** S4.7 — hand-offs and the conversations that settle them. */
export interface HandoffStore {
  open(input: {
    projectId: string;
    questionId: string;
    toPersonId: string | null;
    toDomain: string | null;
    note: string;
    askedBy: string;
  }): Promise<string>;
  reply(input: {
    handoffId: string;
    parentId: string | null;
    authorId: string;
    body: string;
  }): Promise<void>;
  resolve(id: string, by: string): Promise<void>;
  /** Every hand-off on one assessment, newest last, with names hydrated. */
  forProject(projectId: string): Promise<Handoff[]>;
  repliesFor(handoffIds: string[]): Promise<Reply[]>;
  /**
   * Everything still waiting on this person — the derived obligation.
   * Nothing is stored as a message, so there is nothing to mark read and
   * nothing that can go stale.
   */
  waitingOn(person: Person): Promise<Handoff[]>;
  /**
   * Replies this person has not seen — the NEWS class. Derived from the
   * replies themselves against one watermark per person, so there is no
   * message table and nothing that can disagree with the conversation it
   * describes.
   */
  newsFor(person: Person): Promise<News[]>;
  clearNews(personId: string): Promise<void>;
}

/** One thing somebody said that this person has not read yet. */
export type News = {
  replyId: string;
  handoffId: string;
  projectId: string;
  projectName: string;
  questionId: string;
  questionLabel: string;
  authorName: string;
  createdAt: Date;
};

function postgresHandoffStore(): HandoffStore {
  const db = getDb();
  const hydrate = () =>
    db
      .select({
        id: schema.handoffs.id,
        projectId: schema.handoffs.projectId,
        projectName: schema.projects.projectName,
        questionId: schema.handoffs.questionId,
        toPersonId: schema.handoffs.toPersonId,
        toDomain: schema.handoffs.toDomain,
        note: schema.handoffs.note,
        askedBy: schema.handoffs.askedBy,
        askedByName: schema.people.name,
        askedByRole: schema.people.role,
        createdAt: schema.handoffs.createdAt,
        resolvedAt: schema.handoffs.resolvedAt,
        resolvedBy: schema.handoffs.resolvedBy,
      })
      .from(schema.handoffs)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.handoffs.projectId))
      .innerJoin(schema.people, eq(schema.people.id, schema.handoffs.askedBy));

  return {
    async open(input) {
      const [row] = await db
        .insert(schema.handoffs)
        .values(input)
        .returning({ id: schema.handoffs.id });
      return row!.id;
    },
    async reply(input) {
      await db.insert(schema.handoffReplies).values(input);
    },
    async resolve(id, by) {
      await db
        .update(schema.handoffs)
        .set({ resolvedAt: new Date(), resolvedBy: by })
        .where(eq(schema.handoffs.id, id));
    },
    async forProject(projectId) {
      const rows = await hydrate()
        .where(eq(schema.handoffs.projectId, projectId))
        .orderBy(schema.handoffs.createdAt);
      return rows.map(shapeHandoff);
    },
    async repliesFor(handoffIds) {
      if (handoffIds.length === 0) return [];
      const rows = await db
        .select({
          id: schema.handoffReplies.id,
          handoffId: schema.handoffReplies.handoffId,
          parentId: schema.handoffReplies.parentId,
          authorId: schema.handoffReplies.authorId,
          authorName: schema.people.name,
          authorRole: schema.people.role,
          body: schema.handoffReplies.body,
          createdAt: schema.handoffReplies.createdAt,
        })
        .from(schema.handoffReplies)
        .innerJoin(schema.people, eq(schema.people.id, schema.handoffReplies.authorId))
        .where(inArray(schema.handoffReplies.handoffId, handoffIds))
        .orderBy(schema.handoffReplies.createdAt);
      return rows;
    },
    async newsFor(person) {
      const rows = await db
        .select({
          replyId: schema.handoffReplies.id,
          handoffId: schema.handoffs.id,
          projectId: schema.handoffs.projectId,
          projectName: schema.projects.projectName,
          questionId: schema.handoffs.questionId,
          authorName: schema.people.name,
          authorId: schema.handoffReplies.authorId,
          createdAt: schema.handoffReplies.createdAt,
          toPersonId: schema.handoffs.toPersonId,
          toDomain: schema.handoffs.toDomain,
          askedBy: schema.handoffs.askedBy,
          resolvedAt: schema.handoffs.resolvedAt,
        })
        .from(schema.handoffReplies)
        .innerJoin(schema.handoffs, eq(schema.handoffs.id, schema.handoffReplies.handoffId))
        .innerJoin(schema.projects, eq(schema.projects.id, schema.handoffs.projectId))
        .innerJoin(schema.people, eq(schema.people.id, schema.handoffReplies.authorId))
        .orderBy(desc(schema.handoffReplies.createdAt))
        .limit(50);
      const since = person.newsClearedAt;
      return rows
        .filter((r) => r.authorId !== person.id)
        .filter((r) => (since ? r.createdAt > since : true))
        // Yours if you asked, or if it is waiting on you. Scoped here rather
        // than left global: the prior platform showed every reviewer every
        // other team's counts.
        .filter(
          (r) =>
            r.askedBy === person.id ||
            isWaitingOn(r, person),
        )
        .map((r) => ({
          replyId: r.replyId,
          handoffId: r.handoffId,
          projectId: r.projectId,
          projectName: r.projectName,
          questionId: r.questionId,
          questionLabel: questionLabelFor(r.questionId),
          authorName: r.authorName,
          createdAt: r.createdAt,
        }));
    },
    async clearNews(personId) {
      await db
        .update(schema.people)
        .set({ newsClearedAt: new Date() })
        .where(eq(schema.people.id, personId));
    },
    async waitingOn(person) {
      // Scoped in SQL to what can possibly be theirs, then filtered by the
      // pure rule so one statement of "is this yours" governs both the
      // count and the screen. The prior platform queried obligations
      // globally and every reviewer saw every other team's counts.
      if (person.role === "requester") return [];
      const rows = (await hydrate().where(isNull(schema.handoffs.resolvedAt))).map(shapeHandoff);
      if (rows.length === 0) return [];
      // Answered questions carry no obligation. Read the answers for exactly
      // the (project, question) pairs still open — one statement, not one
      // per hand-off — so the bell derives from the record rather than from
      // a stored resolution flag (F1).
      const answered = new Set(
        (
          await db
            .select({
              projectId: schema.answers.projectId,
              questionId: schema.answers.questionId,
            })
            .from(schema.answers)
            .where(
              inArray(
                schema.answers.questionId,
                rows.map((h) => h.questionId),
              ),
            )
        ).map((a) => `${a.projectId}::${a.questionId}`),
      );
      return rows.filter((h) =>
        isWaitingOn(h, person, answered.has(`${h.projectId}::${h.questionId}`)),
      );
    },
  };
}

function shapeHandoff(row: {
  id: string;
  projectId: string;
  projectName: string;
  questionId: string;
  toPersonId: string | null;
  toDomain: string | null;
  note: string;
  askedBy: string;
  askedByName: string;
  askedByRole: string;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}): Handoff {
  // The question's own words are resolved on the way out, never stored: the
  // instrument owns the wording and a copy here would drift from it.
  return { ...row, questionLabel: questionLabelFor(row.questionId) };
}

/**
 * Submission: the fact, the declaration, and the findings it raised (S7).
 * One act, one transaction — a submission recorded without its declaration
 * would be a stamp nobody stands behind (G-40a).
 */
export interface SubmissionStore {
  submit(input: {
    projectId: string;
    person: string;
    shown: Declared[];
    gaps: Gap[];
    findings: SynthesisedFinding[];
  }): Promise<void>;
  findingsFor(projectId: string): Promise<FindingRow[]>;
  declarationFor(projectId: string): Promise<DeclarationRow | null>;
}

export type FindingRow = SynthesisedFinding & { id: string; raisedAt: Date; raisedBy: string };
export type DeclarationRow = {
  declaredBy: string;
  declaredAt: Date;
  shown: Declared[];
  gaps: Gap[];
};

/** Raised when a submission has already been claimed by another call. */
export class AlreadySubmitted extends Error {
  constructor(projectId: string) {
    super(`project ${projectId} was already submitted`);
    this.name = "AlreadySubmitted";
  }
}

export function postgresSubmissionStore(): SubmissionStore {
  const db = getDb();
  return {
    async submit({ projectId, person, shown, gaps, findings: raised }) {
      // All of it or none: the stamp, what was declared, and what it
      // raised are one act.
      await db.transaction(async (tx) => {
        // Claim the submission first, and only proceed if THIS call is the
        // one that set the stamp. Guarding the update without checking
        // whether it changed anything let three concurrent submits each
        // write a declaration and a duplicate set of findings.
        const claimed = await tx
          .update(schema.projects)
          .set({ submittedAt: new Date(), submittedBy: person })
          .where(and(eq(schema.projects.id, projectId), isNull(schema.projects.submittedAt)))
          .returning({ id: schema.projects.id });
        if (claimed.length === 0) {
          throw new AlreadySubmitted(projectId);
        }
        await tx.insert(schema.declarations).values({ projectId, declaredBy: person, shown, gaps });
        if (raised.length > 0) {
          await tx.insert(schema.findings).values(
            raised.map((finding) => ({
              projectId,
              questionId: finding.questionId,
              objective: finding.objective,
              objectiveName: finding.objectiveName,
              kind: finding.kind,
              note: finding.note,
              raisedBy: person,
            })),
          );
        }
      });
    },
    async findingsFor(projectId) {
      const rows = await db
        .select()
        .from(schema.findings)
        .where(eq(schema.findings.projectId, projectId))
        .orderBy(schema.findings.raisedAt);
      return rows.map((row) => ({
        id: row.id,
        questionId: row.questionId,
        objective: row.objective,
        objectiveName: row.objectiveName,
        kind: row.kind as SynthesisedFinding["kind"],
        note: row.note,
        raisedAt: row.raisedAt,
        raisedBy: row.raisedBy,
      }));
    },
    async declarationFor(projectId) {
      const [row] = await db
        .select()
        .from(schema.declarations)
        .where(eq(schema.declarations.projectId, projectId))
        .orderBy(desc(schema.declarations.declaredAt))
        .limit(1);
      if (!row) return null;
      return {
        declaredBy: row.declaredBy,
        declaredAt: row.declaredAt,
        shown: row.shown as Declared[],
        gaps: row.gaps as Gap[],
      };
    },
  };
}

export function submissionStore(): SubmissionStore {
  return postgresSubmissionStore();
}

export function handoffStore(): HandoffStore {
  return postgresHandoffStore();
}
