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
import type { ReviewCounts } from "./review-standing";
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
  /** When it was submitted, or null while it is still a draft (§4.1). */
  submittedAt: Date | null;
  /**
   * The intake columns as stored, so a listing can work out where each
   * assessment actually is without a query per row. Raw, not flattened:
   * `intakeValuesFrom` is what turns it into answers.
   */
  intake: Record<string, unknown>;
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
  /**
   * Every submitted assessment, with what a reviewer still has to do — the
   * counts `reviewStanding` turns into lines somebody can act on.
   *
   * One query rather than a pass per project: the reviewer's list and the
   * bell both need this on every page load, and N assessments would
   * otherwise be N round trips before anything renders.
   */
  /**
   * Every submitted assessment and the raw counts behind its standing.
   *
   * Scoped, because the requester's own list needs the same counts for the
   * two assessments that are theirs — and a listing that asked for
   * everyone's would hand one person's work to another (§2, F2).
   */
  awaitingReview(scope?: ProjectScope): Promise<SubmittedForReview[]>;
  get(id: string): Promise<ProjectRecord | null>;
  create(
    projectName: string,
    createdBy: string | null,
  ): Promise<{ id: string }>;
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

/** A submitted assessment and the raw counts behind its standing. */
export type SubmittedForReview = {
  id: string;
  projectName: string;
  businessUnit: string | null;
  startedBy: string | null;
  submittedAt: Date;
  counts: ReviewCounts;
};

export function postgresProjectStore(): ProjectStore {
  const db = getDb();
  return {
    async list(scope) {
      // The whole project row, not six columns of it. The listing has to
      // say where each assessment stands, and that reasons from the intake
      // answers — which live on this row. Selecting them here is one query;
      // fetching them per listed project was twenty-five.
      const query = db
        .select({ project: schema.projects, startedBy: schema.people.name })
        .from(schema.projects)
        .leftJoin(
          schema.people,
          eq(schema.people.id, schema.projects.createdBy),
        )
        .where(
          scope.createdBy
            ? eq(schema.projects.createdBy, scope.createdBy)
            : undefined,
        )
        .orderBy(desc(schema.projects.updatedAt));
      // No limit means no limit. A silent internal cap would be the same
      // quiet truncation F11 objected to, one layer down.
      const rows = await (scope.limit === undefined
        ? query
        : query.limit(scope.limit));
      // The stored label, never today's list — that is what makes a rename
      // safe (NFR-22).
      return rows.map(({ project, startedBy }) => ({
        id: project.id,
        projectName: project.projectName,
        businessUnit: project.businessUnit
          ? labelOf(project.businessUnit as ReferenceAnswer)
          : null,
        updatedAt: project.updatedAt,
        startedBy,
        submittedAt: project.submittedAt,
        intake: project as unknown as Record<string, unknown>,
      }));
    },
    async count(scope) {
      const [row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.projects)
        .where(
          scope.createdBy
            ? eq(schema.projects.createdBy, scope.createdBy)
            : undefined,
        );
      return row?.total ?? 0;
    },
    async awaitingReview(scope = {}) {
      const owner = scope.createdBy ?? null;
      // Findings carry no "open" column: a finding is open until something
      // in dispositions settles it, so that is what is asked.
      const rows = await db.execute(sql`
        select
          p.id,
          p.project_name          as "projectName",
          p.business_unit         as "businessUnit",
          pe.name                 as "startedBy",
          p.submitted_at          as "submittedAt",
          -- The ids, not a count: which of these a given reviewer may sign
          -- depends on the risk domain that owns each one, and SQL has no
          -- idea what a risk domain is. Counting here produced an alert
          -- that told somebody four answers were waiting for them when
          -- every one belonged to another area.
          coalesce((select array_agg(distinct a.question_id) from answers a
             where a.project_id = p.id and a.question_id like 't3.%'),
             '{}')                as "answeredIds",
          coalesce((select array_agg(distinct at.question_id) from attestations at
             where at.project_id = p.id), '{}')
                                  as "attestedIds",
          coalesce((select array_agg(f.objective) from findings f
             left join dispositions d on d.finding_id = f.id
             where f.project_id = p.id and d.id is null
               and f.kind = 'gap'), '{}')
                                  as "openGaps",
          coalesce((select array_agg(f.objective) from findings f
             left join dispositions d on d.finding_id = f.id
             where f.project_id = p.id and d.id is null
               and f.kind = 'enhancement'), '{}')
                                  as "openEnhancements",
          coalesce((select array_agg(f.objective) from findings f
             left join dispositions d on d.finding_id = f.id
             where f.project_id = p.id and d.id is null
               and f.kind = 'non-compliance'), '{}')
                                  as "openViolations",
          -- jsonb_typeof guard, not decoration: one legacy row holds the
          -- string "[]" rather than an array, and jsonb_array_length
          -- throws on a scalar rather than returning null.
          coalesce((select case
               when jsonb_typeof(dec.gaps) = 'array'
               then jsonb_array_length(dec.gaps) else 0 end
             from declarations dec
             where dec.project_id = p.id
             order by dec.declared_at desc limit 1), 0)::int
                                  as "declaredGaps"
        from projects p
        left join people pe on pe.id = p.created_by
        where p.submitted_at is not null
          and (${owner}::text is null or p.created_by = ${owner})
        order by p.submitted_at desc
      `);
      const list = (
        Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
      ) as Array<Record<string, unknown>>;
      return list.map((row) => ({
        id: String(row.id),
        projectName: String(row.projectName),
        businessUnit: row.businessUnit
          ? labelOf(row.businessUnit as ReferenceAnswer)
          : null,
        startedBy: row.startedBy ? String(row.startedBy) : null,
        submittedAt: new Date(row.submittedAt as string),
        counts: {
          answeredIds: (row.answeredIds as string[] | null) ?? [],
          attestedIds: (row.attestedIds as string[] | null) ?? [],
          openGaps: (row.openGaps as string[] | null) ?? [],
          openEnhancements: (row.openEnhancements as string[] | null) ?? [],
          openViolations: (row.openViolations as string[] | null) ?? [],
          declaredGaps: Number(row.declaredGaps ?? 0),
        },
      }));
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
        .select({
          byName: schema.people.name,
          at: schema.intakeEvents.createdAt,
        })
        .from(schema.intakeEvents)
        .leftJoin(
          schema.people,
          eq(schema.people.id, schema.intakeEvents.changedBy),
        )
        .where(eq(schema.intakeEvents.projectId, projectId))
        .orderBy(desc(schema.intakeEvents.createdAt))
        .limit(1);
      return row ?? null;
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
      const order: Record<string, number> = {
        requester: 0,
        assessor: 1,
        admin: 2,
      };
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
      const [row] = await db
        .select()
        .from(schema.people)
        .where(eq(schema.people.id, id));
      return row ? shape(row) : null;
    },
  };
}

export function peopleStore(): PeopleStore {
  return postgresPeopleStore();
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
      .innerJoin(
        schema.projects,
        eq(schema.projects.id, schema.handoffs.projectId),
      )
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
        .innerJoin(
          schema.people,
          eq(schema.people.id, schema.handoffReplies.authorId),
        )
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
        .innerJoin(
          schema.handoffs,
          eq(schema.handoffs.id, schema.handoffReplies.handoffId),
        )
        .innerJoin(
          schema.projects,
          eq(schema.projects.id, schema.handoffs.projectId),
        )
        .innerJoin(
          schema.people,
          eq(schema.people.id, schema.handoffReplies.authorId),
        )
        .orderBy(desc(schema.handoffReplies.createdAt))
        .limit(50);
      const since = person.newsClearedAt;
      return (
        rows
          .filter((r) => r.authorId !== person.id)
          .filter((r) => (since ? r.createdAt > since : true))
          // Yours if you asked, or if it is waiting on you. Scoped here rather
          // than left global: the prior platform showed every reviewer every
          // other team's counts.
          .filter((r) => r.askedBy === person.id || isWaitingOn(r, person))
          .map((r) => ({
            replyId: r.replyId,
            handoffId: r.handoffId,
            projectId: r.projectId,
            projectName: r.projectName,
            questionId: r.questionId,
            questionLabel: questionLabelFor(r.questionId),
            authorName: r.authorName,
            createdAt: r.createdAt,
          }))
      );
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
      const rows = (
        await hydrate().where(isNull(schema.handoffs.resolvedAt))
      ).map(shapeHandoff);
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

export function handoffStore(): HandoffStore {
  return postgresHandoffStore();
}

// Submission and review live in their own module (NFR-6), re-exported here
// so the store seam stays one import for every caller.
export {
  AlreadySubmitted,
  postgresReviewStore,
  postgresSubmissionStore,
  reviewStore,
  submissionStore,
  type AttestationRow,
  type DeclarationRow,
  type DispositionRow,
  type FindingRow,
  type ReviewStore,
  type SubmissionStore,
} from "./repo-review";
