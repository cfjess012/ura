/**
 * What the agent may see of an assessment (SPEC §6.1, G-65).
 *
 * Not a server action: it is shared by the conversation, the document
 * drafting and the proposal pass, and none of them wants it reachable as an
 * endpoint of its own. It sits outside `agent-actions.ts` because that file
 * met NFR-6's 800-line ceiling, and because a thing three callers need is
 * better named than nested.
 */
import type { AssessmentContext } from "@/lib/agent-contract";
import { gateStates } from "@/lib/instrument";
import { firstIncompleteSection, INTAKE_SECTIONS } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { CRITERIA } from "@/lib/intake-rubric";
import { findAuthority, termsIn } from "@/lib/policy-source";
import { answerStore } from "@/lib/repo";
import { whatsOnScreen } from "@/lib/whats-on-screen";

/**
 * What the agent may see of this assessment.
 *
 * Labels and values as displayed, never database rows and never internal
 * identifiers — hand an agent an id and it will eventually say one out
 * loud. This is also what its reply is checked against, which is why it is
 * assembled here rather than left to the caller.
 */
export async function assessmentContext(
  projectId: string,
  project: Record<string, unknown>,
  /** Where they are, so the reply can be about what they can see. */
  pathname?: string,
  /** What they just said, so policy can be looked up on their own words. */
  said?: string,
): Promise<AssessmentContext> {
  const values = intakeValuesFrom(project);
  const stored = await answerStore().current(projectId);

  const onRecord: Array<{ label: string; value: string }> = [];
  for (const section of INTAKE_SECTIONS) {
    for (const field of section.fields) {
      const value = values[field.id];
      if (value === undefined || value === null || value === "") continue;
      onRecord.push({
        label: field.label,
        value: Array.isArray(value) ? value.join(", ") : String(value),
      });
    }
  }

  // Which risk areas are settled, and which are still open — in their
  // names, so the agent can talk about them the way a person would.
  const states = gateStates(stored, values);
  const openQuestions = states
    .filter((state) => state.answer === null)
    .map((state) => `Does ${state.category.name} apply to this activity?`);

  // Where this assessment actually stands, so "what should I do next?" can
  // be answered from the record rather than guessed at from the screen.
  // Every page computes its own version of this line for its own header and
  // none of it reached the assistant, which is why it could describe the
  // question in front of somebody and not the journey around it.
  const gates = gateStates(stored, values);
  const askable = gates.filter((state) => !state.settled);
  const openGates = askable.filter((state) => state.answer === null);
  const incomplete = firstIncompleteSection(values);
  const standing = project.submittedAt
    ? "Submitted. It is with a reviewer now and the answers cannot change."
    : incomplete
      ? `Still describing the activity — the "${incomplete}" section is not finished, and the risk areas do not open until it is.`
      : openGates.length > 0
        ? `The activity is described. ${openGates.length} of ${askable.length} risk areas still need a yes or no; severity and controls follow from whichever apply.`
        : `Every risk area is answered. What is left is severity, the control questions that follow from it, and then declaring it and handing it to a reviewer.`;

  const looking = pathname ? whatsOnScreen(pathname) : null;
  // The rubric, but only where it applies. On a risk-area screen it is
  // noise; on an intake screen it is the difference between a thought
  // partner and a stranger agreeing with everything.
  // What the organisation's own standards say about the words they used.
  // Retrieval runs every turn and returning nothing is the ordinary case —
  // no intent detection, because intent is not a pattern match, and a
  // router that guessed wrong once started a drafting sweep over "what is
  // today's date".
  const authority = findAuthority([
    ...termsIn(said ?? ""),
    ...termsIn((looking?.questions ?? []).join(" ")),
  ]).map((clause) => ({
    policy: clause.policy,
    reference: clause.reference,
    version: clause.version,
    clauseId: clause.clauseId,
    heading: clause.heading,
    text: clause.text,
  }));

  const graded = pathname?.includes("/intake/")
    ? CRITERIA.map((c) => ({ criterion: c.label, fullMarks: c.anchors["4"] }))
    : undefined;

  return {
    projectId,
    looking: looking ?? undefined,
    standing,
    graded,
    authority: authority.length > 0 ? authority : undefined,
    activity:
      typeof values.projectDescription === "string" &&
      values.projectDescription.trim() !== ""
        ? values.projectDescription
        : "The activity has not been described yet.",
    onRecord,
    openQuestions,
  };
}
