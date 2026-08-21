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
import { failure, type Result } from "@/lib/errors";
import { canAnswer, NotPermitted } from "@/lib/people";
import {
  intakePatchFrom,
  projectNameOrNull,
  type SubmittedEntries,
} from "@/lib/intake-values";
import { INSTRUMENT, prefillFor } from "@/lib/instrument";
import { intakeValuesFrom } from "@/lib/intake-values";
import { answerStore, projectStore } from "@/lib/repo";

/** FormData is a web detail; the logic layer takes a plain record. */
function entriesFrom(formData: FormData): SubmittedEntries {
  const entries: SubmittedEntries = {};
  for (const key of new Set(formData.keys())) {
    entries[key] = formData.getAll(key).map(String);
  }
  return entries;
}

export async function createProject(formData: FormData) {
  const name = projectNameOrNull(formData.get("projectName"));
  if (!name) throw new Error("Give the assessment a project name to start.");
  const person = await currentPerson();
  const { id } = await projectStore().create(name, person.id);
  redirect(`/projects/${id}`);
}

export async function saveIntake(
  projectId: string,
  formData: FormData,
): Promise<Result<{ savedAt: string }>> {
  const patch = intakePatchFrom(entriesFrom(formData));
  try {
    const existed = await projectStore().updateIntake(projectId, patch);
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
      "Couldn't save — your answers are still on screen. Check your connection and try again.",
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
    const person = await currentPerson();
    if (!canAnswer(person.role)) throw new NotPermitted("answer assessment questions", person.role);
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
      "Couldn't record that answer — nothing was saved. Check your connection and try again.",
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

/** Choosing a persona on the front door, then into the product. */
export async function choosePerson(formData: FormData): Promise<void> {
  const id = String(formData.get("personId") ?? "");
  const jar = await cookies();
  jar.set(PERSON_COOKIE, id, { path: "/", sameSite: "lax", httpOnly: false });
  redirect("/projects");
}
