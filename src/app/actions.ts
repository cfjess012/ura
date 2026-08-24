"use server";

/**
 * Server actions are **executors only** (SPEC §26.1): read the request,
 * call pure logic, call the store, return a typed result. No business rules
 * live here, so the same logic runs unchanged in a Lambda handler or an
 * AgentCore task with a different executor in front of it.
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentPerson, PERSON_COOKIE } from "@/lib/current-person";
import { failure, isFailure, type Failure, type Result } from "@/lib/errors";
import { attestationProblem, attestationRefusal } from "@/lib/attestation";
import { type DispositionKind, dispositionProblem } from "@/lib/disposition";
import {
  canAnswer,
  canAttest,
  canStartAssessment,
  NotPermitted,
} from "@/lib/people";
import {
  intakeChanges,
  intakePatchFrom,
  intakeValuesFrom,
  projectNameOrNull,
  type SubmittedEntries,
} from "@/lib/intake-values";
import { CATEGORIES, INSTRUMENT, gateStates } from "@/lib/instrument";
import { litPaths, pathSubmissionProblems } from "@/lib/engine";
import { questionLabelFor } from "@/lib/question-label";
import type { AnswerLookup } from "@/lib/conditions";
import {
  SEVERITY,
  accumulatedFor,
  severityQuestionsFor,
  severitySubmissionProblems,
} from "@/lib/severity";
import {
  declarableFrom,
  declarationMatches,
  earlierGaps,
  gapsIn,
  submissionProblem,
  synthesiseFindings,
  type Declared,
  type Gap,
} from "@/lib/submission";
import {
  TIER3,
  TIER3_ANSWERS,
  isTier3Value,
  objectiveForQuestion,
  objectivesFor,
  submissionProblems,
  type Tier3Answer,
  type Tier3Value,
} from "@/lib/tier3";
import { editableProject, openProject } from "@/lib/project-access";
import {
  AlreadySubmitted,
  answerStore,
  handoffStore,
  peopleStore,
  projectStore,
  reviewStore,
  submissionStore,
} from "@/lib/repo";
import { resolutionProblem } from "@/lib/handoff";

/** FormData is a web detail; the logic layer takes a plain record. */
function entriesFrom(formData: FormData): SubmittedEntries {
  const entries: SubmittedEntries = {};
  for (const key of new Set(formData.keys())) {
    entries[key] = formData.getAll(key).map(String);
  }
  return entries;
}

/**
 * Start an assessment. Returns a typed result rather than throwing: a
 * refusal is an ordinary outcome with a sentence of its own, not a crash
 * that lands on the generic error boundary saying the page failed to draw
 * (§25.1, N3). The redirect on success is the one thing that must throw —
 * that is how `redirect` works.
 */
export async function createProject(
  _previous: Failure | null,
  formData: FormData,
): Promise<Failure | null> {
  const name = projectNameOrNull(formData.get("projectName"));
  const person = await currentPerson();
  // §2: a Risk Assessor reviews activities, they do not own them. Checked
  // here and not only in the markup — the UI is never the enforcement point.
  if (!canStartAssessment(person.role)) {
    return failure(
      "createProject",
      new NotPermitted("start an assessment", person.role),
      "A Risk Assessor reviews assessments rather than starting them. Switch to the person who owns this activity to begin one.",
      { retryable: false },
    );
  }
  if (!name) {
    return failure(
      "createProject",
      new Error("empty project name"),
      "Give the assessment a name to start — a working name is fine.",
      { expected: true },
    );
  }
  const { id } = await projectStore().create(name, person.id);
  redirect(`/projects/${id}`);
}

export async function saveIntake(
  projectId: string,
  formData: FormData,
): Promise<Result<{ savedAt: string }>> {
  try {
    // Whose assessment this is, decided before anything is written (N1).
    const allowed = await editableProject(projectId, "saveIntake");
    if (isFailure(allowed)) return allowed;
    // The directory is read here and handed to the pure function, which is
    // why that function stays liftable: people are operational data and a
    // real deployment resolves them from an IdP (G-46, §26.1).
    const directory = (await peopleStore().list()).map((person) => ({
      id: person.id,
      label: person.title ? `${person.name} — ${person.title}` : person.name,
    }));
    const patch = intakePatchFrom(entriesFrom(formData), directory);
    const { project: before, person } = allowed;
    // What moved, decided by pure logic, so the history is testable without
    // a database (F5).
    const changes = intakeChanges(
      before as unknown as Record<string, unknown>,
      patch,
    );
    const existed = await projectStore().updateIntake(projectId, patch, {
      changes,
      changedBy: person.id,
    });
    if (!existed) {
      return failure(
        "saveIntake",
        new Error(`no project row for ${projectId}`),
        "That assessment no longer exists. Copy your answers somewhere safe before leaving this page.",
        { retryable: false },
      );
    }
    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const, savedAt: new Date().toISOString() };
  } catch (error) {
    return failure(
      "saveIntake",
      error,
      "Couldn't save just now — your answers are still on screen, so nothing was lost. Try again in a moment.",
    );
  }
}

/**
 * Record a gate answer (FR-3). Answers are insert-only (NFR-1): this always
 * inserts, never updates, and the newest row is the current answer.
 *
 * A person answering here always records source "person" and confirmed —
 * even when they simply accept what intake pre-filled, because a human
 * looking at it and agreeing is a different fact from a value derived on
 * their behalf (FR-22).
 */
export async function answerGate(
  projectId: string,
  questionId: string,
  value: "Yes" | "No",
): Promise<Result<{ recorded: true }>> {
  try {
    const allowed = await editableProject(projectId, "answerGate");
    if (isFailure(allowed)) return allowed;
    const { person } = allowed;
    if (!canAnswer(person.role)) {
      return failure(
        "answerGate",
        new NotPermitted("answer assessment questions", person.role),
        "This role doesn't answer assessment questions, so nothing was recorded. Switch to the person who owns this assessment.",
        { retryable: false },
      );
    }
    const answers = answerStore();
    const versionId = await answers.activeVersionId(INSTRUMENT.slug);
    await answers.record({
      projectId,
      questionId,
      value,
      source: "person",
      confirmed: true,
      instrumentVersionId: versionId,
      answeredBy: person.id,
    });
    revalidatePath(`/projects/${projectId}/assess`);
    return { ok: true as const, recorded: true as const };
  } catch (error) {
    return failure(
      "answerGate",
      error,
      "That answer wasn't recorded, so nothing changed. Try again in a moment.",
    );
  }
}

/**
 * Record which threads apply inside a category (FR-4). The value is a list,
 * stored as JSON so it keeps its shape — and insert-only like every other
 * answer, so changing your mind writes a new row rather than erasing the
 * old one (NFR-1).
 *
 * An empty selection is a real answer: "this area applies, but none of
 * these specific threads do." It must be storable, or the person is stuck
 * on a screen with no honest way forward.
 */
export async function answerPaths(
  projectId: string,
  selections: Record<string, string[]>,
): Promise<Result<{ recorded: true }>> {
  try {
    const allowed = await editableProject(projectId, "answerPaths");
    if (isFailure(allowed)) return allowed;
    const { person } = allowed;
    if (!canAnswer(person.role)) {
      return failure(
        "answerPaths",
        new NotPermitted("answer assessment questions", person.role),
        "This role doesn't answer assessment questions, so nothing was recorded. Switch to the person who owns this assessment.",
        { retryable: false },
      );
    }

    // Validate every area BEFORE writing any of it, using the pure rule so
    // it is testable without a database.
    const problems = pathSubmissionProblems(CATEGORIES, selections);
    if (problems.length > 0) {
      return failure(
        "answerPaths",
        new Error(problems.map((p) => JSON.stringify(p)).join("; ")),
        "Some of those options aren't part of this assessment any more — it may have changed since this page was opened. Reload to see the current questions; nothing was saved.",
        { retryable: false },
      );
    }
    const versionId = await answerStore().activeVersionId(INSTRUMENT.slug);
    const rows = Object.entries(selections).map(([categoryKey, selected]) => ({
      projectId,
      questionId: CATEGORIES.find((c) => c.key === categoryKey)!.pathQuestion!
        .questionId,
      value: selected,
      source: "person" as const,
      confirmed: true,
      instrumentVersionId: versionId,
      answeredBy: person.id,
    }));

    // All of them, or none (B1).
    await answerStore().recordAll(rows);
    revalidatePath(`/projects/${projectId}/assess`);
    return { ok: true as const, recorded: true as const };
  } catch (error) {
    return failure(
      "answerPaths",
      error,
      "Those selections weren't recorded, so nothing changed. Your ticks are still on screen — try again in a moment.",
    );
  }
}

/**
 * Record severity answers and their detail selections (FR-6, FR-8).
 *
 * Everything the caller sends is validated before anything is written, and
 * the whole set lands in one transaction — the lesson from the paths screen,
 * which wrote area by area and then told people nothing had been saved
 * after saving half of it (G-40a). A submission naming a question or a band
 * the instrument does not offer is refused, not narrowed (G-42).
 */

/**
 * What a Tier-3 child's cross-tier condition reads: the assessment's own
 * answers, in the shape the one predicate expects (§3.2.3). Built here
 * rather than passed in, so the server checks conditions against the record
 * rather than against whatever the client claims is visible.
 */
async function lookupFor(projectId: string): Promise<AnswerLookup> {
  const stored = await answerStore().current(projectId);
  const lookup: AnswerLookup = {};
  const paths: string[] = [];
  for (const [questionId, value] of Object.entries(stored)) {
    if (typeof value.value === "string" || Array.isArray(value.value)) {
      lookup[questionId] = value.value;
    }
    if (questionId.startsWith("path.") && Array.isArray(value.value))
      paths.push(...value.value);
  }
  lookup.paths = paths;
  return lookup;
}

/**
 * Unanswered work from the tiers before Tier 3, for the declaration.
 * Server-side and shared with the screen, so the two cannot disagree about
 * what is missing (§24.9 — two adjacent screens said 18 and 0).
 */
async function earlierGapsFor(
  projectId: string,
  intake: AnswerLookup,
  stored: Awaited<ReturnType<ReturnType<typeof answerStore>["current"]>>,
): Promise<Gap[]> {
  const gates = gateStates(stored, intake);
  const selections: Record<string, string[]> = {};
  for (const category of CATEGORIES) {
    const value = category.pathQuestion
      ? stored[category.pathQuestion.questionId]?.value
      : undefined;
    if (Array.isArray(value)) selections[category.key] = value as string[];
  }
  const lit = litPaths(CATEGORIES, gates, selections, intake);
  const severity = severityQuestionsFor(lit.map((path) => path.id)).map(
    (question) => ({
      questionId: question.questionId,
      name: question.name,
      text: question.text,
      answered: stored[question.questionId] !== undefined,
    }),
  );
  const open = (await handoffStore().forProject(projectId)).filter(
    (h) => h.resolvedAt === null,
  );
  return earlierGaps({
    gates: gates.map((g) => ({
      category: g.category,
      answer: g.answer,
      settled: g.settled,
    })),
    severity,
    handedOff: open.map((h) => ({
      questionId: h.questionId,
      label: `${questionLabelFor(h.questionId)} — with a risk assessor`,
    })),
  });
}

/**
 * Submit the assessment (S7): the declaration, the named gaps, and the
 * findings the Tier-3 answers raise.
 *
 * Every rule is checked here rather than by the form. The one that matters
 * most: the answers the person declared accurate must still be the answers
 * on record. If one moved between the page rendering and this call, their
 * confirmation describes something that no longer exists — so it is
 * refused and they read it again, rather than being recorded as having
 * declared something they never saw (G-42).
 */
export async function submitAssessment(
  projectId: string,
  input: { shown: Declared[]; gapsAcknowledged: boolean },
): Promise<Result<{ submitted: true; findings: number }>> {
  try {
    const allowed = await editableProject(projectId, "submitAssessment", true);
    if (isFailure(allowed)) return allowed;
    const { person, project } = allowed;
    if (!canAnswer(person.role)) {
      return failure(
        "submitAssessment",
        new NotPermitted("submit an assessment", person.role),
        "This role doesn't submit assessments. Switch to the person who owns this one.",
        { retryable: false, expected: true },
      );
    }

    const intake = intakeValuesFrom(
      project as unknown as Record<string, unknown>,
    );
    // The project row, so reference answers keep their labels (B2).
    const current = declarableFrom(
      project as unknown as Record<string, unknown>,
    );
    if (!declarationMatches(input.shown, current)) {
      return failure(
        "submitAssessment",
        new Error("declaration is stale"),
        "The answers on this page have changed since you read them. Reload and read them again before declaring them accurate — nothing was submitted.",
        { retryable: false, expected: true },
      );
    }

    const stored = await answerStore().current(projectId);
    const required = objectivesFor(
      accumulatedFor(stored, intake).map((c) => c.objective),
    );
    const values: Record<string, Tier3Value> = {};
    for (const [questionId, value] of Object.entries(stored)) {
      if (questionId.startsWith("t3.") && isTier3Value(value.value))
        values[questionId] = value.value;
    }
    const lookup = await lookupFor(projectId);
    const gaps = gapsIn(
      required,
      values,
      lookup,
      await earlierGapsFor(projectId, intake, stored),
    );

    const problem = submissionProblem({
      alreadySubmitted: project.submittedAt !== null,
      declaredCount: input.shown.length,
      expectedCount: current.length,
      gapsAcknowledged: input.gapsAcknowledged,
      gapCount: gaps.length,
    });
    if (problem) {
      return failure(
        "submitAssessment",
        new Error(problem),
        `${problem} Nothing was submitted.`,
        {
          retryable: false,
          expected: true,
        },
      );
    }

    const raised = synthesiseFindings(required, values, lookup);
    await submissionStore().submit({
      projectId,
      person: person.id,
      // What the SERVER computed, never what the client sent. Labels were
      // taken verbatim from the payload and written to the permanent
      // record: a forged request stored "I accept all liability
      // personally" as a label under a real person's name (verifier B3).
      // `declarationMatches` has already proven these are value-equal.
      shown: current,
      gaps,
      findings: raised,
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/", "layout");
    return {
      ok: true as const,
      submitted: true as const,
      findings: raised.length,
    };
  } catch (error) {
    if (error instanceof AlreadySubmitted) {
      return failure(
        "submitAssessment",
        error,
        "This assessment was submitted a moment ago — possibly by a second click. Nothing was submitted twice.",
        { retryable: false, expected: true },
      );
    }
    return failure(
      "submitAssessment",
      error,
      "The assessment wasn't submitted. Everything you answered is safe — try again in a moment.",
    );
  }
}

/**
 * Record Tier-3 answers: does the required control actually exist (FR-12)?
 *
 * The note rule is enforced HERE, not by the form. §3.4 requires a written
 * note on Partial, No and N-A, and FR-28's lesson is that a rule the form
 * alone enforces is decoration — a forged request bypasses it.
 */
export async function answerObjectives(
  projectId: string,
  values: Record<string, { answer: string; note: string }>,
): Promise<Result<{ recorded: true }>> {
  try {
    const allowed = await editableProject(projectId, "answerObjectives");
    if (isFailure(allowed)) return allowed;
    const { person } = allowed;
    if (!canAnswer(person.role)) {
      return failure(
        "answerObjectives",
        new NotPermitted("answer assessment questions", person.role),
        "This role doesn't answer assessment questions, so nothing was recorded. Switch to the person who owns this assessment.",
        { retryable: false, expected: true },
      );
    }

    const shaped: Record<string, Tier3Value> = {};
    for (const [questionId, value] of Object.entries(values)) {
      if (!isTier3Value(value)) {
        return failure(
          "answerObjectives",
          new Error(`bad value for ${questionId}`),
          "Some of those answers aren't in a shape this assessment recognises, so nothing was saved. Reload and try again.",
          { retryable: false },
        );
      }
      shaped[questionId] = value;
    }

    // Authorise against what this assessment actually asks, derived from
    // the record — not against the whole instrument, and certainly not
    // against whatever ids the caller sent. A key outside that set is
    // refused, not ignored: ignoring it is what allowed a forged request to
    // write an object into a gate answer and flip it (verifier S6-2).
    const stored = await answerStore().current(projectId);
    const intake = intakeValuesFrom(
      allowed.project as unknown as Record<string, unknown>,
    );
    const required = objectivesFor(
      accumulatedFor(stored, intake).map((c) => c.objective),
    );
    const problems = submissionProblems(
      required,
      shaped,
      await lookupFor(projectId),
    );
    if (problems.length > 0) {
      return failure(
        "answerObjectives",
        new Error(problems.join("; ")),
        `${problems[0]} Nothing was saved.`,
        { retryable: false, expected: true },
      );
    }

    const store = answerStore();
    const versionId = await store.activeVersionId(TIER3.slug);
    await store.recordAll(
      Object.entries(shaped).map(([questionId, value]) => ({
        projectId,
        questionId,
        value: value as unknown as string,
        source: "person",
        confirmed: true,
        instrumentVersionId: versionId,
        answeredBy: person.id,
      })),
    );
    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const, recorded: true as const };
  } catch (error) {
    return failure(
      "answerObjectives",
      error,
      "Those answers weren't saved. Everything you answered before is safe — try again in a moment.",
    );
  }
}

export async function answerSeverity(
  projectId: string,
  answers: Record<string, string | string[]>,
): Promise<Result<{ recorded: true }>> {
  try {
    const allowed = await editableProject(projectId, "answerSeverity");
    if (isFailure(allowed)) return allowed;
    const { person } = allowed;
    if (!canAnswer(person.role)) {
      return failure(
        "answerSeverity",
        new NotPermitted("answer assessment questions", person.role),
        "This role doesn't answer assessment questions, so nothing was recorded. Switch to the person who owns this assessment.",
        { retryable: false },
      );
    }

    const problems = severitySubmissionProblems(answers);
    if (problems.length > 0) {
      return failure(
        "answerSeverity",
        new Error(problems.join("; ")),
        "Some of those answers aren't part of this assessment any more — it may have changed since this page was opened. Reload to see the current questions; nothing was saved.",
        { retryable: false },
      );
    }

    const store = answerStore();
    const versionId = await store.activeVersionId(SEVERITY.slug);
    await store.recordAll(
      Object.entries(answers).map(([questionId, value]) => ({
        projectId,
        questionId,
        value,
        source: "person" as const,
        confirmed: true,
        instrumentVersionId: versionId,
        answeredBy: person.id,
      })),
    );
    revalidatePath(`/projects/${projectId}/assess`);
    return { ok: true as const, recorded: true as const };
  } catch (error) {
    return failure(
      "answerSeverity",
      error,
      "Those answers weren't recorded, so nothing changed. They're still on screen — try again in a moment.",
    );
  }
}

/**
 * Pilot persona switch (§2). Not authentication and not presented as such:
 * it selects which seeded person is using the platform so roles can be
 * demonstrated. Replacing it with single sign-on touches current-person.ts
 * alone — no authority rule moves.
 */
export async function switchPerson(formData: FormData): Promise<void> {
  const id = String(formData.get("personId") ?? "");
  // Only a sign-in persona may be assumed. Neither action validated this,
  // so setting the cookie by hand made you any of the fifteen people in the
  // directory — including twelve who were never personas (S4.5).
  const allowed = await peopleStore().signIns();
  if (!allowed.some((person) => person.id === id)) return;
  const jar = await cookies();
  jar.set(PERSON_COOKIE, id, { path: "/", sameSite: "lax", httpOnly: false });
  revalidatePath("/", "layout");
}

/**
 * Leave the product and return to the front door — the pilot equivalent of
 * signing out. Clears the chosen persona so the next person starts where
 * the story starts.
 */
export async function switchUser(): Promise<void> {
  const jar = await cookies();
  jar.delete(PERSON_COOKIE);
  redirect("/");
}

/** Choosing a persona on the front door, then into the product. */
export async function choosePerson(formData: FormData): Promise<void> {
  const id = String(formData.get("personId") ?? "");
  // Only a sign-in persona may be assumed. Neither action validated this,
  // so setting the cookie by hand made you any of the fifteen people in the
  // directory — including twelve who were never personas (S4.5).
  const allowed = await peopleStore().signIns();
  if (!allowed.some((person) => person.id === id)) return;
  const jar = await cookies();
  jar.set(PERSON_COOKIE, id, { path: "/", sameSite: "lax", httpOnly: false });
  redirect("/projects");
}
