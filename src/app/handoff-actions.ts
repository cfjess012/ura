"use server";

/**
 * Hand-offs: asking somebody else a question you cannot answer, the
 * conversation that follows, and the obligation it creates (S4.7, FR-36).
 *
 * Split out of `actions.ts` at S8 because that file passed the NFR-6 hard
 * cap. Executors only (§26.1).
 */
import { revalidatePath } from "next/cache";
import { currentPerson } from "@/lib/current-person";
import { failure, isFailure, type Result } from "@/lib/errors";
import { NotPermitted, canAttest } from "@/lib/people";
import { editableProject, openProject } from "@/lib/project-access";
import { handoffStore, peopleStore } from "@/lib/repo";
import { answerStore } from "@/lib/repo-answers";
import { questionLabelFor } from "@/lib/question-label";
import { resolutionProblem } from "@/lib/handoff";

/**
 * Hand a question to a person or an office (S4.7, FR-35).
 *
 * Not an answer: the record says the question moved, not that it was
 * answered. The requester keeps going, which is the whole point.
 */
export async function handOffQuestion(
  projectId: string,
  input: {
    questionId: string;
    toPersonId: string | null;
    toDomain: string | null;
    note: string;
  },
): Promise<Result<{ handoffId: string }>> {
  try {
    const allowed = await editableProject(projectId, "handOffQuestion");
    if (isFailure(allowed)) return allowed;
    const { person } = allowed;
    if (!input.questionId || (!input.toPersonId && !input.toDomain)) {
      return failure(
        "handOffQuestion",
        new Error("a hand-off needs a question and a recipient"),
        "Pick who should look at this, and we'll pass it on.",
        { retryable: false, expected: true },
      );
    }
    const already = (await handoffStore().forProject(projectId)).find(
      (h) => h.questionId === input.questionId && h.resolvedAt === null,
    );
    // Asking twice is the same ask — return the open one rather than
    // stacking a second alert on the same question.
    if (already) return { ok: true as const, handoffId: already.id };
    const handoffId = await handoffStore().open({
      projectId,
      questionId: input.questionId,
      toPersonId: input.toPersonId,
      toDomain: input.toDomain,
      note: input.note.trim(),
      askedBy: person.id,
    });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const, handoffId };
  } catch (error) {
    return failure(
      "handOffQuestion",
      error,
      "That wasn't handed over just now, so nobody has been told. Your answers are safe — try again in a moment.",
    );
  }
}

/** Say something in the conversation on a hand-off (FR-36). */
export async function replyToHandoff(
  projectId: string,
  input: { handoffId: string; parentId: string | null; body: string },
): Promise<Result<{ posted: true }>> {
  try {
    const allowed = await openProject(projectId);
    if (!allowed.ok)
      return failure(
        "replyToHandoff",
        new Error("not permitted"),
        "This conversation belongs to an assessment you can't open.",
        { retryable: false, expected: true },
      );
    if (input.body.trim() === "")
      return failure(
        "replyToHandoff",
        new Error("empty"),
        "Write something first.",
        {
          retryable: false,
          expected: true,
        },
      );
    // The hand-off must belong to the project we just authorised. Without
    // this, authority was checked against the caller's OWN project id while
    // the write used the caller's hand-off id, and the two were never
    // required to match: a requester posted into a thread on an assessment
    // the same session refused to open by URL, and it rendered under their
    // name in the owner's thread and the assessor's bell. `resolveHandoff`
    // already scoped this way; this is the same check, and the reason the
    // rule is "authority is decided on the object" (§2, N1, verifier F2).
    const handoff = (await handoffStore().forProject(projectId)).find(
      (h) => h.id === input.handoffId,
    );
    if (!handoff)
      return failure(
        "replyToHandoff",
        new Error("no such hand-off in this assessment"),
        "That conversation is gone.",
        { retryable: false, expected: true },
      );
    await handoffStore().reply({
      handoffId: input.handoffId,
      parentId: input.parentId,
      authorId: allowed.person.id,
      body: input.body.trim(),
    });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const, posted: true as const };
  } catch (error) {
    return failure(
      "replyToHandoff",
      error,
      "That reply didn't post, so nobody has seen it. It's still on screen — try again in a moment.",
    );
  }
}

/**
 * Close a hand-off (FR-37).
 *
 * Deliberately narrow: only the person it was handed to, and only once the
 * question actually has an answer. Otherwise "resolved" would mean
 * "somebody clicked resolved", and a pinned alert that can be clicked away
 * with the work undone is just a message with extra steps.
 */
export async function resolveHandoff(
  projectId: string,
  handoffId: string,
): Promise<Result<{ resolved: true }>> {
  try {
    const allowed = await openProject(projectId);
    if (!allowed.ok)
      return failure(
        "resolveHandoff",
        new Error("not permitted"),
        "That isn't yours to close.",
        {
          retryable: false,
          expected: true,
        },
      );
    const handoff = (await handoffStore().forProject(projectId)).find(
      (h) => h.id === handoffId,
    );
    if (!handoff)
      return failure(
        "resolveHandoff",
        new Error("no such hand-off"),
        "That hand-off is gone.",
        {
          retryable: false,
          expected: true,
        },
      );
    const answers = await answerStore().current(projectId);
    const problem = resolutionProblem(
      handoff,
      allowed.person,
      answers[handoff.questionId] !== undefined,
      allowed.project.submittedAt !== null,
    );
    if (problem)
      return failure("resolveHandoff", new Error(problem), problem, {
        retryable: false,
        expected: true,
      });
    await handoffStore().resolve(handoffId, allowed.person.id);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/", "layout");
    return { ok: true as const, resolved: true as const };
  } catch (error) {
    return failure(
      "resolveHandoff",
      error,
      "That didn't close just now, so it's still open. Try again in a moment.",
    );
  }
}

/**
 * Mark everything said so far as read.
 *
 * One watermark on the person, not a row per message. There is nothing to
 * mark read individually because there are no message rows — news is
 * derived from the replies themselves.
 */
export async function clearNews(): Promise<void> {
  const person = await currentPerson();
  await handoffStore().clearNews(person.id);
  revalidatePath("/", "layout");
}
