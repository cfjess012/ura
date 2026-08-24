/**
 * The stores behind submission and review (S7, S8).
 *
 * Split out of `repo.ts` at S8, which had passed the NFR-6 hard cap. The
 * seam is unchanged: callers still import a `<thing>Store()` function and
 * never see a query, so swapping the driver stays a one-file change (§26.1).
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Declared, Gap, SynthesisedFinding } from "./submission";

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

export type FindingRow = SynthesisedFinding & {
  id: string;
  raisedAt: Date;
  raisedBy: string;
};
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
          .where(
            and(
              eq(schema.projects.id, projectId),
              isNull(schema.projects.submittedAt),
            ),
          )
          .returning({ id: schema.projects.id });
        if (claimed.length === 0) {
          throw new AlreadySubmitted(projectId);
        }
        await tx
          .insert(schema.declarations)
          .values({ projectId, declaredBy: person, shown, gaps });
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
              // Present exactly on a non-compliance; the CHECK in 0024
              // refuses either half without the other.
              policyRef: finding.citation?.policyRef ?? null,
              clauseId: finding.citation?.clauseId ?? null,
              clauseText: finding.citation?.clauseText ?? null,
              expected: finding.citation?.expected ?? null,
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
        citation:
          row.policyRef && row.clauseId && row.clauseText && row.expected
            ? {
                policyRef: row.policyRef,
                clauseId: row.clauseId,
                clauseText: row.clauseText,
                expected: row.expected,
              }
            : undefined,
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

/** Attestations and dispositions — the reviewer's acts (S8). */
export interface ReviewStore {
  attestationsFor(projectId: string): Promise<AttestationRow[]>;
  attest(input: {
    projectId: string;
    questionId: string;
    person: string;
    domain: string | null;
    act: "approve" | "correct" | "not-applicable";
    correctedAnswer: string | null;
    note: string;
  }): Promise<void>;
  dispositionsFor(projectId: string): Promise<DispositionRow[]>;
  dispose(input: {
    findingId: string;
    kind: string;
    resolvedBy: string;
    note: string;
    remediationOwner: string | null;
    remediationDue: Date | null;
    acceptedBy: string | null;
    expiresAt: Date | null;
  }): Promise<void>;
}

export type AttestationRow = {
  id: string;
  questionId: string;
  attestedBy: string;
  attestedDomain: string | null;
  attestedAt: Date;
  act: string;
  correctedAnswer: string | null;
  note: string;
};

export type DispositionRow = {
  findingId: string;
  kind: string;
  resolvedBy: string;
  resolvedAt: Date;
  note: string;
  remediationOwner: string | null;
  remediationDue: Date | null;
  acceptedBy: string | null;
  expiresAt: Date | null;
};

export function postgresReviewStore(): ReviewStore {
  const db = getDb();
  return {
    async attestationsFor(projectId) {
      const rows = await db
        .select()
        .from(schema.attestations)
        .where(eq(schema.attestations.projectId, projectId))
        .orderBy(desc(schema.attestations.attestedAt));
      return rows.map((row) => ({
        id: row.id,
        questionId: row.questionId,
        attestedBy: row.attestedBy,
        attestedDomain: row.attestedDomain,
        attestedAt: row.attestedAt,
        act: row.act,
        correctedAnswer: row.correctedAnswer,
        note: row.note,
      }));
    },
    async attest(input) {
      // Insert-only: correcting an attestation is a new row, so the
      // sequence of who signed what and when survives intact (§5.1).
      await db.insert(schema.attestations).values({
        projectId: input.projectId,
        questionId: input.questionId,
        attestedBy: input.person,
        attestedDomain: input.domain,
        act: input.act,
        correctedAnswer: input.correctedAnswer,
        note: input.note,
      });
    },
    async dispositionsFor(projectId) {
      const rows = await db
        .select({
          findingId: schema.dispositions.findingId,
          kind: schema.dispositions.kind,
          resolvedBy: schema.dispositions.resolvedBy,
          resolvedAt: schema.dispositions.resolvedAt,
          note: schema.dispositions.note,
          remediationOwner: schema.dispositions.remediationOwner,
          remediationDue: schema.dispositions.remediationDue,
          acceptedBy: schema.dispositions.acceptedBy,
          expiresAt: schema.dispositions.expiresAt,
        })
        .from(schema.dispositions)
        .innerJoin(
          schema.findings,
          eq(schema.findings.id, schema.dispositions.findingId),
        )
        .where(eq(schema.findings.projectId, projectId))
        .orderBy(desc(schema.dispositions.resolvedAt));
      return rows;
    },
    async dispose(input) {
      // Insert-only like every other piece of evidence: settling a finding a
      // second way leaves the first settlement standing and readable, so the
      // history of how a gap was handled cannot be rewritten (§5.1).
      await db.insert(schema.dispositions).values({
        findingId: input.findingId,
        kind: input.kind,
        resolvedBy: input.resolvedBy,
        note: input.note,
        remediationOwner: input.remediationOwner,
        remediationDue: input.remediationDue,
        acceptedBy: input.acceptedBy,
        expiresAt: input.expiresAt,
      });
    },
  };
}

export function reviewStore(): ReviewStore {
  return postgresReviewStore();
}
