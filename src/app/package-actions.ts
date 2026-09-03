"use server";
import { findingStanding } from "@/lib/submission";
import { rateAssessment, type Rating } from "@/lib/rating-of";

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
  assemblePackage,
  nameIn,
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
    const owed = accumulatedFor(stored, intake);
    const required = objectivesFor(owed.map((c) => c.objective));
    // The controls the pilot asks nothing about, kept by name so the export
    // says what was required and never asked (S13, defect d).
    const askable = new Set(required.map((o) => o.id));
    const recorded = owed.filter((c) => !askable.has(c.objective));
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
    const rating = rateAssessment({
      stored,
      intake,
      findings,
      dispositions,
      attestations,
      now,
    });
    const payload = assemblePackage({
      rating,
      instrumentVersions: await packageStore().instrumentVersionsFor(projectId),
      project,
      intake,
      stored,
      required,
      recorded,
      latest,
      findings,
      settlements: inForce,
      everyone,
      by: person.name,
      now,
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

