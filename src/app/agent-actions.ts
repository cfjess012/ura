"use server";

/**
 * Talking to the assistant (SPEC §22.1, the assessment companion).
 *
 * Executor only: build the record the agent is allowed to see, call the
 * seam, write both sides of the conversation down. Every rule about what
 * the agent may say lives in the agent service and the shared contract —
 * none of it is re-implemented here.
 */
import { revalidatePath } from "next/cache";
import { agentTransport } from "@/lib/agent";
import type { AssessmentContext } from "@/lib/agent-contract";
import { currentPerson } from "@/lib/current-person";
import { canAnswer, NotPermitted } from "@/lib/people";
import { failure, isFailure, type Result } from "@/lib/errors";
import { intakeValuesFrom } from "@/lib/intake-values";
import { editableProject, openProject } from "@/lib/project-access";
import { answerStore } from "@/lib/repo";
import { sessionStore } from "@/lib/session";
import { INTAKE_SECTIONS } from "@/lib/intake";
import { documentStore } from "@/lib/documents";
import { quoteAppearsVerbatim } from "@/lib/agent-contract";
import {
  belowFloor,
  scoringBrief,
  verdictFrom,
  verdictWhenAgentUnavailable,
  type RubricVerdict,
} from "@/lib/intake-rubric";
import { gateStates } from "@/lib/instrument";
import { whatsOnScreen } from "@/lib/whats-on-screen";

/**
 * What the agent may see of this assessment.
 *
 * Labels and values as displayed, never database rows and never internal
 * identifiers — hand an agent an id and it will eventually say one out
 * loud. This is also what its reply is checked against, which is why it is
 * assembled here rather than left to the caller.
 */
async function contextFor(
  projectId: string,
  project: Record<string, unknown>,
  /** Where they are, so the reply can be about what they can see. */
  pathname?: string,
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

  const looking = pathname ? whatsOnScreen(pathname) : null;

  return {
    projectId,
    looking: looking ?? undefined,
    activity:
      typeof values.projectDescription === "string" &&
      values.projectDescription.trim() !== ""
        ? values.projectDescription
        : "The activity has not been described yet.",
    onRecord,
    openQuestions,
  };
}

export type AgentTurn = { speaker: "person" | "agent"; said: string };

/**
 * Ask the assistant something. Returns what it said, and the conversation
 * is on the record either way — including when it could not help.
 */
export async function askAgent(
  projectId: string,
  said: string,
  /**
   * Where the person is. The only thing the client can honestly report
   * about itself — everything on that screen is derived from it here, so
   * nothing the caller sends becomes a question.
   */
  pathname?: string,
): Promise<Result<{ reply: string; asking: string | null }>> {
  try {
    const trimmed = said.trim();
    if (trimmed === "") {
      return failure(
        "askAgent",
        new Error("nothing said"),
        "Type something first.",
        {
          retryable: false,
          expected: true,
        },
      );
    }
    const person = await currentPerson();
    const access = await openProject(projectId);
    if (!access.ok) {
      return failure(
        "askAgent",
        new Error("not permitted"),
        "That assessment isn't yours to work on.",
        { retryable: false, expected: true },
      );
    }

    const transport = agentTransport();
    const conversationId = `${projectId}:${person.id}`;
    const assessment = await contextFor(
      projectId,
      access.project as unknown as Record<string, unknown>,
      pathname,
    );
    const history = (await sessionStore().history(conversationId)).map(
      (turn) => ({
        speaker: turn.speaker,
        said: turn.said,
      }),
    );

    // What the person said goes on the record before the model is called,
    // so a failure mid-turn cannot lose it.
    await sessionStore().append({
      conversationId,
      projectId,
      speaker: "person",
      said: trimmed,
    });

    const answer = await transport.converse({
      said: trimmed,
      assessment,
      history,
    });

    await sessionStore().append({
      conversationId,
      projectId,
      speaker: "agent",
      said: answer.reply,
    });

    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const, reply: answer.reply, asking: answer.asking };
  } catch (error) {
    return failure(
      "askAgent",
      error,
      "I couldn't answer just then. Nothing you have written was affected — the questions still work as normal.",
    );
  }
}

/** The conversation so far, for rendering the panel on the server. */
export async function conversationFor(projectId: string): Promise<AgentTurn[]> {
  const person = await currentPerson();
  const turns = await sessionStore().history(`${projectId}:${person.id}`);
  return turns.map((turn) => ({ speaker: turn.speaker, said: turn.said }));
}

/**
 * How much text the pilot will take from one document, and the most it will
 * accept at all.
 *
 * Truncating silently meant a quote from beyond the cut could never be
 * found, and the person was never told which part had been read. A 2.6 MB
 * file of noise was accepted and stored as evidence.
 */
const MAX_DOCUMENT_CHARS = 60_000;
const MAX_UPLOAD_CHARS = 400_000;

/**
 * Read a document the requester supplied and propose answers from it.
 *
 * Every proposal is **unconfirmed** and carries the passage it came from.
 * It is not their answer until they say so — that is the whole point, and
 * the schema enforces it: a drafted row cannot arrive confirmed, and it
 * cannot exist without its quote (migration 0023).
 *
 * The quote is re-checked here, against the document as stored, even though
 * the agent already checked it. The two checks are not redundant: the
 * agent's protects the wire, this one protects the record, and only one of
 * them is on this side of the deployment boundary.
 */
export async function draftFromDocument(
  projectId: string,
  document: { name: string; body: string },
): Promise<
  Result<{
    proposed: number;
    abstained: number;
    document: string;
    truncated: boolean;
  }>
> {
  try {
    const person = await currentPerson();
    // editableProject, not openProject: a submitted assessment is closed to
    // everyone, and reading a document into one would put a proposal behind
    // a declaration somebody has already signed.
    const allowed = await editableProject(projectId, "draftFromDocument");
    if (isFailure(allowed)) return allowed;
    const access = await openProject(projectId);
    if (!access.ok) {
      return failure(
        "draftFromDocument",
        new Error("not permitted"),
        "That assessment isn't yours to work on.",
        { retryable: false, expected: true },
      );
    }
    // The requester's act, and the record says so — so it must be theirs.
    // canAnswer alone let an assessor record a Tier-1 answer on somebody
    // else's assessment, indistinguishable from the owner's own.
    if (access.project.createdBy !== person.id) {
      return failure(
        "draftFromDocument",
        new NotPermitted("draft answers", person.role),
        "Reading a document into an assessment proposes answers in the owner's name, so it is theirs to do.",
        { retryable: false, expected: true },
      );
    }
    if (!canAnswer(person.role)) {
      return failure(
        "draftFromDocument",
        new NotPermitted("draft answers", person.role),
        "Reading a document into an assessment is the requester's act — the answers proposed would be theirs to confirm.",
        { retryable: false, expected: true },
      );
    }
    const whole = document.body.trim();
    if (whole.length > MAX_UPLOAD_CHARS) {
      return failure(
        "draftFromDocument",
        new Error("too large"),
        `That file is too large to read — about ${Math.round(whole.length / 1000)},000 characters, and the limit is ${MAX_UPLOAD_CHARS / 1000},000. Try the section that covers security and data.`,
        { retryable: false, expected: true },
      );
    }
    const body = whole.slice(0, MAX_DOCUMENT_CHARS);
    const truncated = whole.length > MAX_DOCUMENT_CHARS;
    if (body === "") {
      return failure(
        "draftFromDocument",
        new Error("empty"),
        "That file had no readable text in it, so there was nothing to read.",
        { retryable: false, expected: true },
      );
    }

    const transport = agentTransport();
    if (!transport.available) {
      return failure(
        "draftFromDocument",
        new Error("no agent"),
        "No assistant is connected, so nothing was read. You can still answer the questions yourself.",
        { retryable: false, expected: true },
      );
    }

    const stored = await documentStore().add({
      projectId,
      name: document.name.trim() || "the document you added",
      body,
      uploadedBy: person.id,
    });

    // Only the risk-area questions nobody has answered. A draft must never
    // overwrite something a person already decided.
    const answers = await answerStore().current(projectId);
    const values = intakeValuesFrom(
      access.project as unknown as Record<string, unknown>,
    );
    const open = gateStates(answers, values).filter(
      (state) => state.answer === null,
    );
    // The questions we actually asked about. Answers are insert-only and
    // the newest row wins, so a draft for an already-answered gate would
    // arrive on top of a person's own answer and show as a proposal over a
    // decision they had already made.
    const openQuestionIds = new Set(
      open.map((state) => state.category.questionId),
    );

    if (open.length === 0) {
      return {
        ok: true as const,
        proposed: 0,
        abstained: 0,
        document: stored.name,
        truncated,
      };
    }

    const assessment = await contextFor(
      projectId,
      access.project as unknown as Record<string, unknown>,
    );
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
    let abstained = 0;

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
        sources: [{ id: stored.name, text: body }],
      })),
    })) {
      // An error is the whole answer, not something to skip past. Dropping
      // these reported "Every question was already answered" when the
      // service was simply unreachable — two false statements in one line.
      if (event.type === "error") {
        failed = event.message;
        continue;
      }
      if (event.type !== "draft") continue;
      const answer = event.answer;
      if (answer.basis === "not_stated" || answer.value === null) {
        abstained += 1;
        continue;
      }
      // The record's own check. The agent already did this; this one is on
      // the side of the boundary that owns the consequence.
      if (!answer.quote || !quoteAppearsVerbatim(answer.quote, body)) {
        abstained += 1;
        continue;
      }
      // It must be one of the questions we actually asked about — not
      // merely a real question. Answers are insert-only and the newest row
      // wins, so a draft for an already-answered gate would arrive on top
      // of a person's own answer and show as a proposal over a decision
      // they had already made.
      if (!openQuestionIds.has(answer.questionId)) {
        abstained += 1;
        continue;
      }
      // The value must be an answer this question actually offers. Nothing
      // checked it before, and gateStates coerces anything that is not
      // "Yes" to "No" — so a hedge like "Probably, if the pilot expands"
      // closed an entire risk area. A non-answer must never produce a
      // negative answer with consequences (§3.2.1, positive evidence only).
      if (answer.value !== "Yes" && answer.value !== "No") {
        abstained += 1;
        continue;
      }
      drafts.push({
        projectId,
        questionId: answer.questionId,
        value: answer.value,
        basis: answer.basis,
        sourceQuote: answer.quote,
        sourceRef: stored.name,
        instrumentVersionId: versionId,
      });
    }

    if (failed && drafts.length === 0) {
      return failure("draftFromDocument", new Error(failed), failed, {
        retryable: true,
        expected: true,
      });
    }

    await answerStore().recordDrafts(drafts);
    revalidatePath(`/projects/${projectId}`);
    return {
      ok: true as const,
      proposed: drafts.length,
      abstained,
      document: stored.name,
      // Said out loud: a quote from past the cut could never be found, and
      // silence about that reads as "I read all of it".
      truncated,
    };
  } catch (error) {
    return failure(
      "draftFromDocument",
      error,
      "That document could not be read just then. Nothing was proposed and nothing was changed.",
    );
  }
}

/**
 * Accept one proposed answer, making it the person's own.
 *
 * Insert-only, so this does not change the draft — it puts a person's
 * answer in front of it. Both stay on the record, which is what makes
 * "the assistant proposed, I accepted" a readable history rather than a
 * claim (§5.1, FR-22).
 */
export async function acceptDraft(
  projectId: string,
  questionId: string,
): Promise<Result<{ accepted: true }>> {
  try {
    const person = await currentPerson();
    // Same lock as every other write: an answer accepted after submission
    // would make the declaration describe a record that no longer exists.
    const allowed = await editableProject(projectId, "acceptDraft");
    if (isFailure(allowed)) return allowed;
    const access = await openProject(projectId);
    if (!access.ok) {
      return failure(
        "acceptDraft",
        new Error("not permitted"),
        "That assessment isn't yours to work on.",
        { retryable: false, expected: true },
      );
    }
    // Accepting writes an answer in the owner's name. Anyone else doing it
    // is answering on their behalf, which §22.1 forbids in as many words.
    if (access.project.createdBy !== person.id) {
      return failure(
        "acceptDraft",
        new NotPermitted("answer", person.role),
        "Accepting a proposal makes it the owner's answer, so it is theirs to accept.",
        { retryable: false, expected: true },
      );
    }
    if (!canAnswer(person.role)) {
      return failure(
        "acceptDraft",
        new NotPermitted("answer", person.role),
        "Accepting a proposed answer makes it your answer, so it is the requester's to accept.",
        { retryable: false, expected: true },
      );
    }
    // The question must be one this assessment actually asks, right now.
    // Without this, a proposal left over from before an intake change could
    // be accepted into a question nobody was asked — which is the thing
    // G-42 forbids, arriving by the back door.
    const stored = await answerStore().current(projectId);
    const values = intakeValuesFrom(
      access.project as unknown as Record<string, unknown>,
    );
    const asked = gateStates(stored, values).find(
      (state) => state.category.questionId === questionId && !state.settled,
    );
    if (!asked) {
      return failure(
        "acceptDraft",
        new Error("not asked"),
        "That question isn't being asked on this assessment any more, so there is nothing to accept.",
        { retryable: false, expected: true },
      );
    }
    const current = stored[questionId];
    // Checked again here rather than trusted: this row could have been
    // written by an older build, or by anything else that reaches the
    // table. A gate answer is Yes or No.
    if (current && current.value !== "Yes" && current.value !== "No") {
      return failure(
        "acceptDraft",
        new Error("not an answer"),
        "That proposal is not one of the answers this question offers, so it cannot be accepted.",
        { retryable: false, expected: true },
      );
    }
    if (!current || current.source !== "drafted") {
      // Nothing to accept means the record moved under them — a person may
      // have answered it in another tab, and their answer wins.
      return failure(
        "acceptDraft",
        new Error("no draft"),
        "There is no proposal waiting on that question any more.",
        { retryable: false, expected: true },
      );
    }
    await answerStore().record({
      projectId,
      questionId,
      value: current.value as string | string[],
      source: "person",
      confirmed: true,
      // Derived from the question, not assumed. Drafts are Tier-1 gates
      // today; assuming that in a version pin would go quietly wrong the
      // first time a draft is for anything else.
      instrumentVersionId: await answerStore().activeVersionId(
        questionId.startsWith("t3.") ? "tier3-objectives" : "tier1-gates",
      ),
      answeredBy: person.id,
    });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const, accepted: true as const };
  } catch (error) {
    return failure(
      "acceptDraft",
      error,
      "That wasn't accepted. The proposal is still there — try again in a moment.",
    );
  }
}

/**
 * Ask the rubric how the description reads (SPEC §22.1).
 *
 * The floor runs here with no model — it costs nothing and catches a name
 * or keyboard noise. Only what clears the floor is worth a model call.
 *
 * **It fails open at every step.** No agent, a slow agent, a wrong agent,
 * a partial answer: all of them pass. A quality assistant that blocks
 * submission has become a gate, and the mission is reducing friction.
 */
export async function checkDescription(
  description: string,
): Promise<Result<{ verdict: RubricVerdict }>> {
  try {
    const floor = belowFloor(description);
    if (floor) {
      return {
        ok: true as const,
        verdict: {
          passes: false,
          // The floor is a real check and needs no model.
          checkedByModel: true,
          opening: null,
          asks: [
            {
              id: "floor",
              label: "The description",
              sentence: floor,
              anchor: "",
            },
          ],
        },
      };
    }

    const transport = agentTransport();
    if (!transport.available) {
      return { ok: true as const, verdict: verdictWhenAgentUnavailable() };
    }
    const scores = await transport.scoreIntake({
      description,
      dimensions: scoringBrief(),
    });
    return { ok: true as const, verdict: verdictFrom(scores) };
  } catch (error) {
    // Even a thrown error passes. Nothing about checking a description is
    // worth stopping somebody over.
    console.error("[checkDescription]", error);
    return { ok: true as const, verdict: verdictWhenAgentUnavailable() };
  }
}
