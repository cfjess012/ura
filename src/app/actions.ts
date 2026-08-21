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
import { canAnswer, canStartAssessment, NotPermitted } from "@/lib/people";
import {
  intakeChanges,
  intakePatchFrom,
  projectNameOrNull,
  type SubmittedEntries,
} from "@/lib/intake-values";
import { CATEGORIES, INSTRUMENT, prefillFor } from "@/lib/instrument";
import { intakeValuesFrom } from "@/lib/intake-values";
import { editableProject } from "@/lib/project-access";
import { answerStore, projectStore } from "@/lib/repo";

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
    );
  }
  const { id } = await projectStore().create(name, person.id);
  redirect(`/projects/${id}`);
}

export async function saveIntake(
  projectId: string,
  formData: FormData,
): Promise<Result<{ savedAt: string }>> {
  const patch = intakePatchFrom(entriesFrom(formData));
  try {
    // Whose assessment this is, decided before anything is written (N1).
    const allowed = await editableProject(projectId, "saveIntake");
    if (isFailure(allowed)) return allowed;
    const { project: before, person } = allowed;
    // What moved, decided by pure logic, so the history is testable without
    // a database (F5).
    const changes = intakeChanges(before as unknown as Record<string, unknown>, patch);
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
  categoryKey: string,
  selected: string[],
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
    const category = CATEGORIES.find((c) => c.key === categoryKey);
    if (!category?.pathQuestion) {
      return failure(
        "answerPaths",
        new Error(`no path question for category ${categoryKey}`),
        "That part of the assessment no longer exists. Your other answers are safe.",
        { retryable: false },
      );
    }
    // Only options the instrument actually offers — a submitted value the
    // instrument does not know is not an answer, it is noise.
    const known = new Set(category.pathQuestion.options.map((o) => o.id));
    const answers = answerStore();
    await answers.record({
      projectId,
      questionId: category.pathQuestion.questionId,
      value: selected.filter((id) => known.has(id)),
      source: "person",
      confirmed: true,
      instrumentVersionId: await answers.activeVersionId(INSTRUMENT.slug),
      answeredBy: person.id,
    });
    revalidatePath(`/projects/${projectId}/assess`);
    return { ok: true as const, recorded: true as const };
  } catch (error) {
    return failure(
      "answerPaths",
      error,
      "Those selections weren't recorded, so nothing changed. Try again in a moment.",
    );
  }
}

/**
 * Persist intake-derived gate answers so a reviewer can see where they came
 * from (FR-22). Unconfirmed until a person visits the screen and agrees.
 */
export async function seedPrefilledGates(projectId: string): Promise<void> {
  const project = await projectStore().get(projectId);
  if (!project) return;
  const intake = intakeValuesFrom(project as unknown as Record<string, unknown>);
  const answers = answerStore();
  const existing = await answers.current(projectId);
  const versionId = await answers.activeVersionId(INSTRUMENT.slug);
  for (const category of INSTRUMENT.categories) {
    if (existing[category.questionId]) continue;
    const prefilled = prefillFor(category, intake);
    if (!prefilled) continue;
    await answers.record({
      projectId,
      questionId: category.questionId,
      value: prefilled.answer,
      source: "intake",
      confirmed: false,
      instrumentVersionId: versionId,
      // Derived from intake, not stated by a person — attribution belongs to
      // whoever confirms it on the gate screen, not to whoever is browsing.
      answeredBy: null,
    });
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
  const jar = await cookies();
  jar.set(PERSON_COOKIE, id, { path: "/", sameSite: "lax", httpOnly: false });
  redirect("/projects");
}
