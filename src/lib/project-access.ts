/**
 * Who may open, and who may change, a particular assessment (§2, N1).
 *
 * Executor layer: it reads the current person and the store, so it is not
 * part of the pure logic tier — the *rule* it enforces lives in
 * `people.ts` and is unit-tested there. What lives here is the plumbing
 * that makes the rule impossible to forget.
 *
 * Why a single helper rather than a check per page: the first version of
 * role scoping filtered the list and nothing else, so every assessment was
 * open to every persona by URL — the list looked scoped and the product was
 * not. A page that calls `openProject` cannot make that mistake, and a page
 * that forgets to call it fails review with one grep.
 */
import { notFound } from "next/navigation";
import { currentPerson } from "./current-person";
import { failure, type Result } from "./errors";
import { mayOpenAssessment, type Person } from "./people";
import { editableAfter } from "./submission";
import { projectStore, type ProjectRecord } from "./repo";

export type ProjectAccess =
  | { ok: true; project: ProjectRecord; person: Person }
  | { ok: false; person: Person };

/**
 * Load an assessment for the current person, or report that it isn't
 * theirs. An assessment that does not exist is a 404; one that exists but
 * belongs to someone else is a refusal, because in a pilot whose whole
 * point is demonstrating roles, "no such thing" would teach the wrong
 * lesson. (Trade-off recorded in G-32: this admits that the id exists.)
 */
export async function openProject(id: string): Promise<ProjectAccess> {
  const [person, project] = await Promise.all([currentPerson(), projectStore().get(id)]);
  if (!project) notFound();
  if (!mayOpenAssessment(person.role, person.id, project.createdBy)) {
    return { ok: false, person };
  }
  return { ok: true, project, person };
}

/**
 * The same rule for a write. Returns a typed failure rather than throwing,
 * so a server action reports it the way every other failure is reported
 * (§25) instead of landing on the generic error boundary.
 */
export async function editableProject(
  id: string,
  what: string,
  /** Only the submission act itself may write to an unsubmitted project. */
  submitting = false,
): Promise<Result<{ project: ProjectRecord; person: Person }>> {
  const [person, project] = await Promise.all([currentPerson(), projectStore().get(id)]);
  if (!project) {
    return failure(
      what,
      new Error(`no project row for ${id}`),
      "That assessment no longer exists. Copy your answers somewhere safe before leaving this page.",
      { retryable: false },
    );
  }
  if (!mayOpenAssessment(person.role, person.id, project.createdBy)) {
    return failure(
      what,
      new Error(`${person.id} (${person.role}) may not write to project ${id}`),
      "This assessment belongs to someone else, so nothing was saved. Ask its owner to make the change, or switch to the person who owns it.",
      { retryable: false },
    );
  }
  // A submitted assessment is closed to everyone who writes through here.
  // Not a courtesy: an answer changed after the declaration would make it
  // describe a record that no longer exists (§4.1, FR-37). The rule was
  // written and unit-tested at S7 and called from nowhere — a rule nothing
  // enforces is decoration, which is FR-28's whole lesson.
  //
  // `submitAssessment` is the one exception and passes `submitting: true`,
  // because the act that sets the stamp cannot be blocked by it.
  if (!submitting && !editableAfter(project.submittedAt)) {
    return failure(
      what,
      new Error(`project ${id} was submitted at ${project.submittedAt?.toISOString()}`),
      "This assessment has been submitted, so nothing was changed. A reviewer has it now — ask them to correct an answer.",
      { retryable: false, expected: true },
    );
  }
  return { ok: true as const, project, person };
}
