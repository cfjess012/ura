"use server";

/**
 * Why a risk area is asking what it is asking (FR-47).
 *
 * The platform already lights parts of an area from answers given earlier
 * and shows the rule behind each — that is honest, and it is terse. Somebody
 * looking at parts they did not tick wants the join between those rules and
 * the rest of what they said, which is what this asks for.
 *
 * **Never load-bearing.** No agent, a slow one, a refused answer: the
 * deterministic reasons stay on screen exactly as they were, and the button
 * says nothing rather than something. An explanation that fails should cost
 * a person nothing at all.
 */
import { agentTransport } from "@/lib/agent";
import { failure, type Result } from "@/lib/errors";
import { categoryByKey } from "@/lib/instrument";
import { openProject } from "@/lib/project-access";
import { assessmentContext } from "./assessment-context";

export async function explainArea(
  projectId: string,
  categoryKey: string,
  parts: Array<{ name: string; ticked: boolean }>,
  added: Array<{ name: string; because: string }>,
): Promise<Result<{ insight: string[] }>> {
  try {
    const category = categoryByKey(categoryKey);
    if (!category) {
      return failure(
        "explainArea",
        new Error(`no category ${categoryKey}`),
        "That risk area no longer exists.",
        { retryable: false, expected: true },
      );
    }
    // Reading only. An explanation changes nothing, so it needs to be
    // theirs to open and nothing more.
    const access = await openProject(projectId);
    if (!access.ok) {
      return failure(
        "explainArea",
        new Error("not permitted"),
        "That assessment isn't yours to work on.",
        { retryable: false, expected: true },
      );
    }
    const transport = agentTransport();
    if (!transport.available) return { ok: true as const, insight: [] };

    const assessment = await assessmentContext(
      projectId,
      access.project as unknown as Record<string, unknown>,
    );
    const insight = await transport.explain({
      area: category.name,
      parts,
      added,
      assessment,
    });
    return { ok: true as const, insight };
  } catch (error) {
    console.error("[explainArea]", error);
    // Not a failure a person needs to see: the reasons they came for are
    // already on the screen.
    return { ok: true as const, insight: [] };
  }
}
