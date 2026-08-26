"use server";

/**
 * Assembling and recording a package (SPEC §4.5).
 *
 * The gate is checked here and not only on the screen, for the reason every
 * gate in this product is: the UI is never the enforcement point (FR-28).
 * A package assembled over an unattested answer would claim a signature
 * that does not exist, and that claim is exactly what the export is for.
 *
 * Assembly reads the record and composes; it derives nothing new. Every
 * value in the payload is one a person gave or a reviewer signed, and the
 * coverage is the instrument's own account of what it asked.
 */
import { gateStates } from "@/lib/instrument";
import { accumulatedFor } from "@/lib/severity";
import { asksNothingFurther } from "@/lib/severity";
import { OBJECTIVES, objectivesFor } from "@/lib/tier3";
import { peopleStore } from "@/lib/repo";
import { answerStore } from "@/lib/repo-answers";
import {
  packageStore,
  reviewStore,
  submissionStore,
  type FindingRow,
} from "@/lib/repo-review";
import { intakeValuesFrom } from "@/lib/intake-values";
import { currentPerson } from "@/lib/current-person";
import { openProject } from "@/lib/project-access";
import { failure, isFailure, type Result } from "@/lib/errors";
import {
  blockers,
  openFindingNames,
  type Blocker,
  type Package,
} from "@/lib/packaging";
import { labelOf, type ReferenceAnswer } from "@/lib/reference";
import policies from "@/data/reference/policies.json";
import { revalidatePath } from "next/cache";

/** Everything the package screen needs, computed from the record. */
export async function packageState(projectId: string): Promise<
  Result<{
    blockers: Blocker[];
    payload: Package | null;
    /** Packages already made, newest first — a re-export is a new one. */
    history: Array<{
      id: string;
      packagedBy: string;
      packagedAt: string;
      answerCount: number;
    }>;
  }>
> {
  try {
    const access = await openProject(projectId);
    if (!access.ok) {
      return failure(
        "packageState",
        new Error("not permitted"),
        "That assessment isn't yours to work on.",
        { retryable: false, expected: true },
      );
    }
    const project = access.project;
    const [stored, findings, attestations, dispositions, everyone, made] =
      await Promise.all([
        answerStore().current(projectId),
        submissionStore().findingsFor(projectId),
        reviewStore().attestationsFor(projectId),
        reviewStore().dispositionsFor(projectId),
        peopleStore().list(),
        packageStore().forProject(projectId),
      ]);

    const intake = intakeValuesFrom(
      project as unknown as Record<string, unknown>,
    );
    const required = objectivesFor(
      accumulatedFor(stored, intake).map((c) => c.objective),
    );
    // The most recent attestation per question is the one that stands —
    // re-attesting appends, it does not replace (§4.2).
    const latest = new Map<string, (typeof attestations)[number]>();
    for (const row of attestations)
      if (!latest.has(row.questionId)) latest.set(row.questionId, row);

    // Dispositions arrive newest first, so the first one seen for a finding
    // is the one in force; the earlier settlements stay readable in the
    // record rather than being overwritten (§5.1).
    const inForce = new Map<string, (typeof dispositions)[number]>();
    for (const row of dispositions)
      if (!inForce.has(row.findingId)) inForce.set(row.findingId, row);

    // "Open" has one definition and it is `findingIsOpen` (§4.3), reached
    // through the pure module so a test can hold it. A shared predicate is
    // only shared if every caller actually calls it.
    const now = new Date();
    const stops = blockers({
      submitted: project.submittedAt !== null,
      required: required.map((o) => ({
        questionId: o.questionId,
        label: o.name,
      })),
      attested: [...latest.keys()],
      openFindings: openFindingNames(findings, inForce, now),
    });

    const history = made.map((p) => ({
      id: p.id,
      packagedBy: nameIn(everyone, p.packagedBy),
      packagedAt: p.packagedAt.toISOString(),
      answerCount: p.answerCount,
    }));

    if (stops.length > 0) {
      return { ok: true as const, blockers: stops, payload: null, history };
    }

    const person = await currentPerson();
    const payload = assemble({
      instrumentVersions: await packageStore().instrumentVersionsFor(projectId),
      project,
      intake,
      stored,
      required,
      latest,
      findings,
      settlements: inForce,
      everyone,
      by: person.name,
    });
    return { ok: true as const, blockers: [], payload, history };
  } catch (error) {
    return failure(
      "packageState",
      error,
      "I couldn't assemble that just then.",
    );
  }
}

/**
 * Record a package. Insert-only: a second one does not replace the first,
 * because each is a claim about a different moment.
 */
export async function makePackage(
  projectId: string,
): Promise<Result<{ id: string; packagedAt: string }>> {
  try {
    const state = await packageState(projectId);
    if (isFailure(state)) return state;
    if (state.blockers.length > 0 || !state.payload) {
      // Say what is outstanding rather than pointing at the screen.
      //
      // This refusal fires in exactly one situation: the record moved
      // underneath somebody who already had the ready page open — a
      // finding raised, an acceptance lapsed. So the screen they are
      // looking at is the stale one, still saying "Ready to package", and
      // "the screen says what is outstanding" was false at the only
      // moment this sentence is ever read.
      const outstanding =
        state.blockers.map((b) => b.says).join(" ") ||
        "Something this needs is no longer in place.";
      return failure(
        "makePackage",
        new Error("blocked"),
        `This can't be packaged yet. ${outstanding}`,
        { retryable: false, expected: true },
      );
    }
    const person = await currentPerson();
    const made = await packageStore().record({
      projectId,
      packagedBy: person.id,
      payload: state.payload,
      answerCount: state.payload.answers.length,
      findingCount: state.payload.findings.length,
    });
    revalidatePath(`/projects/${projectId}/package`);
    return {
      ok: true as const,
      id: made.id,
      packagedAt: made.packagedAt.toISOString(),
    };
  } catch (error) {
    return failure("makePackage", error, "I couldn't record that just then.");
  }
}

/** An objective by its question id, for answers outside the required set. */
function objectiveByQuestion(questionId: string) {
  return OBJECTIVES.find((o) => o.questionId === questionId) ?? null;
}

function nameIn(
  everyone: Array<{ id: string; name: string }>,
  id: string,
): string {
  return everyone.find((p) => p.id === id)?.name ?? id;
}

/** A reference answer renders as the label it was chosen by (NFR-22). */
function shown(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(shown).join(", ");
  if (typeof value === "object" && value !== null && "label" in value) {
    return labelOf(value as ReferenceAnswer);
  }
  return String(value);
}

function assemble(input: {
  project: {
    id: string;
    projectName: string;
    submittedAt: Date | null;
    submittedBy: string | null;
  };
  intake: Record<string, unknown>;
  stored: Record<string, { value: unknown }>;
  required: Array<{ id: string; questionId: string; name: string }>;
  latest: Map<
    string,
    {
      act: string;
      note: string;
      attestedBy: string;
      attestedAt: Date;
      correctedAnswer: string | null;
    }
  >;
  findings: FindingRow[];
  /**
   * The settlement in force per finding. A Map rather than the raw rows:
   * dispositions are insert-only and a finding settled twice has two, and
   * keying the array by findingId kept whichever happened to come last —
   * the oldest, since they arrive newest first.
   */
  settlements: Map<
    string,
    {
      findingId: string;
        kind: string;
      note: string;
      resolvedBy: string;
      resolvedAt: Date;
      remediationOwner: string | null;
      remediationDue: Date | null;
      acceptedBy: string | null;
      expiresAt: Date | null;
    }
  >;
  everyone: Array<{ id: string; name: string }>;
  by: string;
  instrumentVersions: Array<{ slug: string; version: string }>;
}): Package {
  const {
    project,
    intake,
    stored,
    required,
    latest,
    findings,
    settlements,
    everyone,
  } = input;
  const who = (id: string | null) => (id ? nameIn(everyone, id) : "");

  const states = gateStates(stored as never, intake as never);
  const coverage = states.map((s) => ({
    area: s.category.name,
    standing: (!(s.settled || s.answer === "Yes")
      ? "closed"
      : asksNothingFurther(s.category.key)
        ? "recorded"
        : "applies") as "applies" | "closed" | "recorded",
    because:
      s.because ??
      (s.answer === "Yes" ? "it applies to this activity" : "it was ruled out"),
  }));

  /**
   * Every attested value (§4.5), not only the currently-required ones.
   *
   * The gate is about the required set — nothing may be packaged while a
   * required answer is unsigned. What goes IN is a different question, and
   * the spec answers it differently: "every attested value". An assessment
   * whose severity later narrowed can hold a signed answer that is no
   * longer required, and dropping it would publish a finding whose answer
   * is missing from the same file.
   */
  const named = new Map(required.map((o) => [o.questionId, o]));
  const answers = [...latest.entries()]
    .map(([questionId, signed]) => {
      const objective =
        named.get(questionId) ?? objectiveByQuestion(questionId);
      if (!objective) return null;
      const given = stored[questionId]?.value as
        { answer?: string; note?: string } | undefined;
      // The attested value, not the submitted one: a correction replaces
      // what the record says, and an N-A is the string, never an omission.
      const value =
        signed.act === "not-applicable"
          ? "N-A"
          : (signed.correctedAnswer ?? given?.answer ?? "");
      return {
        questionId,
        objective: objective.id,
        label: objective.name,
        value,
        note: signed.note || given?.note || "",
        attestedBy: who(signed.attestedBy),
        attestedAt: signed.attestedAt.toISOString(),
        act: signed.act,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .sort((a, b) => a.objective.localeCompare(b.objective));

  const packagedFindings = findings.map((f) => {
    const d = settlements.get(f.id);
    return {
      objective: f.objective,
      objectiveName: f.objectiveName,
      kind: f.kind as Package["findings"][number]["kind"],
      note: f.note,
      // Present exactly when the finding cited a clause — the same
      // invariant the findings table enforces with a CHECK.
      ...(f.citation
        ? {
            clause: {
              reference: f.citation.policyRef,
              clauseId: f.citation.clauseId,
              version: f.citation.policyVersion,
              text: f.citation.clauseText,
            },
          }
        : {}),
      settlement: {
        kind: d?.kind ?? "",
        note: d?.note ?? "",
        resolvedBy: who(d?.resolvedBy ?? null),
        resolvedAt: d?.resolvedAt?.toISOString() ?? "",
        ...(d?.remediationOwner ? { owner: who(d.remediationOwner) } : {}),
        ...(d?.remediationDue ? { due: d.remediationDue.toISOString() } : {}),
        ...(d?.acceptedBy ? { acceptedBy: who(d.acceptedBy) } : {}),
        ...(d?.expiresAt ? { expiresAt: d.expiresAt.toISOString() } : {}),
      },
    };
  });

  return {
    assessment: {
      id: project.id,
      name: project.projectName,
      submittedBy: who(project.submittedBy),
      submittedAt: project.submittedAt?.toISOString() ?? "",
      classification: shown(intake.dataClassification),
    },
    coverage,
    answers,
    findings: packagedFindings,
    provenance: {
      packagedAt: new Date().toISOString(),
      packagedBy: input.by,
      // Which edition of the instrument asked these questions. A replay
      // against a different one is a different question, and a reader has
      // to be able to tell.
      // What asked these questions, from what the answers pinned. This read
      // the *currently activated* editions, which is the same answer right
      // up until the instrument is re-versioned — and a replayable record
      // that changes its own provenance when the instrument moves is the
      // one thing it must not do. The screen promised what the code did
      // not (§24: copy is a claim).
      instrumentVersions: input.instrumentVersions,
      policyVersion:
        (policies as { version?: string }).version ??
        (policies as { policies?: Array<{ version?: string }> }).policies?.[0]
          ?.version ??
        null,
    },
  };
}
