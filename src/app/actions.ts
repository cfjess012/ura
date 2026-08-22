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
import { CATEGORIES, INSTRUMENT } from "@/lib/instrument";
import { pathSubmissionProblems } from "@/lib/engine";
import { SEVERITY, severitySubmissionProblems } from "@/lib/severity";
import { editableProject } from "@/lib/project-access";
import { answerStore, peopleStore, projectStore } from "@/lib/repo";

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
      questionId: CATEGORIES.find((c) => c.key === categoryKey)!.pathQuestion!.questionId,
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
