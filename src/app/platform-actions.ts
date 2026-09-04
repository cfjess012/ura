"use server";

import { revalidatePath } from "next/cache";
import { canAnswer } from "@/lib/people";
import { editableProject } from "@/lib/project-access";
import { failure, isFailure, type Result } from "@/lib/errors";
import { answerStore } from "@/lib/repo-answers";
import { intakeValuesFrom } from "@/lib/intake-values";
import { INSTRUMENT } from "@/lib/instrument";
import { TIER3 } from "@/lib/tier3";
import { inheritanceFor, inheritedAnswer, PLATFORMS_QUESTION } from "@/lib/inheritance";
import { platformById } from "@/lib/platforms";
import { objectivesFor } from "@/lib/tier3";

/**
 * What an activity sits on, and what that discharges (G-83).
 *
 * Two acts, and the second one is why they are here rather than folded into
 * the general answer path: **the provenance is computed on the server**. A
 * client that could name the platform, the owner and the attestation date
 * for an inherited control could write an assurance nobody gave. The client
 * says "confirm what I inherit"; the server works out what that is.
 */

/** Record which assessed platforms this activity uses. */
export async function choosePlatforms(
  projectId: string,
  platformIds: string[],
): Promise<Result<{ recorded: true }>> {
  try {
    const allowed = await editableProject(projectId, "choosePlatforms");
    if (isFailure(allowed)) return allowed;
    const { person } = allowed;
    if (!canAnswer(person.role)) {
      return failure(
        "choosePlatforms",
        new Error(`${person.role} may not answer`),
        "This role doesn't answer assessment questions, so nothing was recorded. Switch to the person who owns this assessment.",
        { retryable: false },
      );
    }
    // Every id must be a platform we have actually assessed. Inheriting from
    // something nobody assessed is the failure this module exists to prevent.
    const unknown = platformIds.filter((id) => platformById(id) === null);
    if (unknown.length > 0) {
      return failure(
        "choosePlatforms",
        new Error(`unknown platforms: ${unknown.join(", ")}`),
        "Some of those platforms aren't ones we've assessed — the list may have changed since this page was opened. Reload to see the current one; nothing was saved.",
        { retryable: false },
      );
    }

    const versionId = await answerStore().activeVersionId(INSTRUMENT.slug);
    await answerStore().recordAll([
      {
        projectId,
        questionId: PLATFORMS_QUESTION,
        value: platformIds,
        source: "person",
        confirmed: true,
        instrumentVersionId: versionId,
        answeredBy: person.id,
      },
    ]);
    revalidatePath(`/projects/${projectId}/assess`);
    return { ok: true as const, recorded: true };
  } catch (error) {
    return failure(
      "choosePlatforms",
      error,
      "Couldn't record that just now — your choices are still on screen, so nothing was lost. Try again in a moment.",
    );
  }
}

/**
 * Accept the controls the chosen platforms provide.
 *
 * The answer is written with the provider, the person who attested and the
 * date, because an inherited "Yes" with no provenance is indistinguishable
 * from one somebody invented.
 */
export async function confirmInherited(
  projectId: string,
): Promise<Result<{ confirmed: number }>> {
  try {
    const allowed = await editableProject(projectId, "confirmInherited");
    if (isFailure(allowed)) return allowed;
    const { person } = allowed;
    if (!canAnswer(person.role)) {
      return failure(
        "confirmInherited",
        new Error(`${person.role} may not answer`),
        "This role doesn't answer assessment questions, so nothing was recorded. Switch to the person who owns this assessment.",
        { retryable: false },
      );
    }

    const stored = await answerStore().current(projectId);
    const project = allowed.project as unknown as Record<string, unknown>;
    const intake = intakeValuesFrom(project);
    const inheritance = inheritanceFor({
      stored,
      intake,
      project,
      now: new Date(),
    });
    // Only the covered controls this instrument actually asks about can
    // carry an answer; the rest are recorded as required and unasked.
    const asked = new Map(
      objectivesFor(inheritance.covered.map((c) => c.objective)).map((o) => [o.id, o.questionId]),
    );
    const versionId = await answerStore().activeVersionId(TIER3.slug);
    const rows = inheritance.covered
      .filter((covered) => asked.has(covered.objective))
      .map((covered) => ({
        projectId,
        questionId: asked.get(covered.objective)!,
        value: inheritedAnswer(covered),
        source: "person" as const,
        confirmed: true,
        instrumentVersionId: versionId,
        answeredBy: person.id,
      }));
    if (rows.length === 0) return { ok: true as const, confirmed: 0 };

    await answerStore().recordAll(rows);
    revalidatePath(`/projects/${projectId}/assess`);
    return { ok: true as const, confirmed: rows.length };
  } catch (error) {
    return failure(
      "confirmInherited",
      error,
      "Couldn't record that just now — nothing was lost, and the controls are still shown below. Try again in a moment.",
    );
  }
}
