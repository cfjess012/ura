/**
 * Proposing an answer to the risk-area question in front of somebody, from
 * what they already wrote at intake (SPEC §22.1, FR-22, G-66).
 *
 * Deliberately **not** exported as a server action. It is called from
 * `askAgent` and nowhere else, so Next mints no endpoint for it — and it
 * re-checks authority itself regardless, because the safety of the thing
 * cannot rest on who happens to call it.
 *
 * The whole design in one line: **the screen decides what may be proposed,
 * the record decides what is still open, and the person decides what is
 * true.** A proposal is an unconfirmed answer carrying the passage it came
 * from; it counts as an answer nowhere until an explicit accept writes one
 * in the owner's name.
 *
 * This is the second route into the mechanism G-66 built for documents. It
 * is not `draftFromDocument`, because that writes a `documents` row first —
 * routing intake drafting through it would mint an undeletable synthetic
 * document per ask, and `sourceRef` would then name a document that is not
 * one. A provenance chain must not lie about itself.
 */
import type { AssessmentContext } from "@/lib/agent-contract";
import { agentTransport } from "@/lib/agent";
import { currentPerson } from "@/lib/current-person";
import { isFailure } from "@/lib/errors";
import {
  admissibleDraft,
  INTAKE_SOURCE,
  type ProposalOutcome,
} from "@/lib/drafts";
import { gateStates } from "@/lib/instrument";
import { intakeAsDocument } from "@/lib/intake";
import { intakeValuesForReading } from "@/lib/intake-values";
import { canAnswer } from "@/lib/people";
import { editableProject, openProject } from "@/lib/project-access";
import { answerStore } from "@/lib/repo-answers";
import { gatesAnswerableAt } from "@/lib/whats-on-screen";

/** The only answers a gate accepts. Not a hint — the record's own list. */
const GATE_VALUES = ["Yes", "No"] as const;

export async function proposeFromIntake(input: {
  projectId: string;
  /** Where they are. The screen selects the scope; nothing else may. */
  pathname: string | undefined;
  /** Already built for the conversation — passed in rather than rebuilt. */
  assessment: AssessmentContext;
}): Promise<ProposalOutcome> {
  const { projectId, pathname, assessment } = input;
  try {
    if (!pathname) return { outcome: "not-here" };
    const askable = gatesAnswerableAt(pathname);
    if (askable.length === 0) return { outcome: "not-here" };

    // Authority, re-checked in full. Conversation only needs openProject —
    // a reviewer may talk about somebody else's assessment. This branch
    // WRITES, so it needs everything the document path needs: not
    // submitted, theirs, and a role that answers.
    const allowed = await editableProject(projectId, "proposeFromIntake");
    if (isFailure(allowed)) {
      return { outcome: "refused", because: allowed.message };
    }
    const access = await openProject(projectId);
    if (!access.ok) {
      return {
        outcome: "refused",
        because: "That assessment is not yours to work on.",
      };
    }
    const person = await currentPerson();
    if (access.project.createdBy !== person.id) {
      return {
        outcome: "refused",
        because:
          "Suggesting an answer here would put it in the owner's name, so it is theirs to ask for.",
      };
    }
    if (!canAnswer(person.role)) {
      return {
        outcome: "refused",
        because:
          "This role does not answer assessment questions, so there is nothing for me to suggest.",
      };
    }

    // The screen said what may be proposed; the record says what is still
    // open. Both, because either alone is wrong.
    // Labels, never ids — every quote the model returns is checked back
    // against this text, and an id it cannot read it will not quote.
    const values = intakeValuesForReading(
      access.project as unknown as Record<string, unknown>,
    );
    const stored = await answerStore().current(projectId);
    const wanted = new Set(askable.map((c) => c.questionId));
    const here = gateStates(stored, values).filter((state) =>
      wanted.has(state.category.questionId),
    );
    const open = here.filter(
      (state) => state.answer === null && !state.settled,
    );
    if (open.length === 0) {
      // Pre-filled from intake is not answered: nobody stated or confirmed
      // it here. Saying "you answered this" about a value derived on their
      // behalf is the claim G-42 exists to stop — and an intake-grounded
      // proposal would only re-derive what the prefill already derived.
      const settled = here.some((state) => state.fromIntake);
      return { outcome: settled ? "already-settled" : "already-answered" };
    }

    const transport = agentTransport();
    if (!transport.available) return { outcome: "unreachable" };

    // Blanks omitted: every quote must be a sentence they wrote, and
    // "(not answered)" is ours.
    const document = intakeAsDocument(values, { blanks: "omitted" });
    if (document.trim() === "") return { outcome: "nothing-in-it" };

    const openIds = new Set(open.map((state) => state.category.questionId));
    const versionId = await answerStore().activeVersionId("tier1-gates");
    const drafts: Array<{
      projectId: string;
      questionId: string;
      value: string | string[];
      basis: string;
      sourceQuote: string;
      sourceRef: string;
      instrumentVersionId: string;
    }> = [];
    let failed: string | null = null;

    for await (const event of transport.run({
      task: "draft",
      projectId,
      conversationId: `${projectId}:${person.id}`,
      questionIds: open.map((state) => state.category.questionId),
      questions: open.map((state) => ({
        questionId: state.category.questionId,
        question: `${state.category.text} (risk area: ${state.category.name})`,
        answerShape: 'one of: "Yes", "No"',
        assessment,
        sources: [{ id: INTAKE_SOURCE, text: document }],
      })),
    })) {
      // An error is the whole answer, not something to skip past — dropping
      // these once reported "already answered" when the service was simply
      // unreachable, which is two false statements in one sentence.
      if (event.type === "error") {
        failed = event.message;
        continue;
      }
      if (event.type !== "draft") continue;
      const verdict = admissibleDraft(
        {
          questionId: event.answer.questionId,
          value: event.answer.value,
          basis: event.answer.basis,
          quote: event.answer.quote,
        },
        { text: document, open: openIds, values: GATE_VALUES },
      );
      if (!verdict.ok) continue;
      drafts.push({
        projectId,
        questionId: event.answer.questionId,
        value: verdict.value,
        basis: event.answer.basis,
        sourceQuote: event.answer.quote!,
        sourceRef: INTAKE_SOURCE,
        instrumentVersionId: versionId,
      });
    }

    if (failed !== null && drafts.length === 0)
      return { outcome: "unreachable" };
    if (drafts.length === 0) return { outcome: "nothing-in-it" };
    await answerStore().recordDrafts(drafts);
    return { outcome: "proposed", proposed: drafts.length };
  } catch (error) {
    // Never throws: the caller is a person mid-conversation, and an
    // exception here would take the reply down with the proposal.
    console.error("[proposeFromIntake]", error);
    return { outcome: "unreachable" };
  }
}
