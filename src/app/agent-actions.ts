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
import { ALL_FIELDS, INTAKE_SECTIONS, intakeAsDocument } from "@/lib/intake";
import { documentStore } from "@/lib/documents";
import { extractText } from "@/lib/extract";
import { quoteAppearsVerbatim,
  type Trouble,
} from "@/lib/agent-contract";
import {
  belowFloor,
  CRITERIA,
  coherenceFrom,
  coherenceWhenUnavailable,
  scoringBrief,
  type Coherence,
  type Level,
} from "@/lib/intake-rubric";
import { gateStates } from "@/lib/instrument";
import { assessmentContext } from "./assessment-context";
import { findAuthority, termsIn } from "@/lib/policy-source";
import { proposalSentence } from "@/lib/drafts";
import { proposeFromIntake } from "./proposal-actions";

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
  /**
   * Which control a master-detail screen has open, by question id.
   *
   * Still only *where they are* — one step finer than the path, because the
   * reviewer's queue holds nine controls at one URL. An id, so the server
   * checks it against the instrument; the words still come from there.
   */
  focus?: string,
): Promise<
  Result<{
    reply: string;
    asking: string | null;
    /** Clauses the lookup returned, in full. A receipt, not a claim. */
    consulted: Array<{
      policy: string;
      reference: string;
      version: string;
      clauseId: string;
      heading: string;
      text: string;
    }>;
  }>
> {
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
    const assessment = await assessmentContext(
      projectId,
      access.project as unknown as Record<string, unknown>,
      pathname,
      trimmed,
      focus,
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

    // Asked to answer what is in front of them: look, once, scoped to this
    // screen. The sentence is composed here and stored as part of the
    // agent's turn, so somebody who reloads reads the conversation they
    // actually had rather than one the client assembled locally.
    const outcome = answer.wantsAnswers
      ? await proposeFromIntake({ projectId, pathname, assessment })
      : null;
    const reply =
      outcome === null
        ? answer.reply
        : `${answer.reply} ${proposalSentence(outcome)}`.trim();

    await sessionStore().append({
      conversationId,
      projectId,
      speaker: "agent",
      said: reply,
    });

    // "layout", because a proposal lands on the risk-area page rather than
    // this one.
    revalidatePath(`/projects/${projectId}`, "layout");
    return {
      ok: true as const,
      reply,
      asking: answer.asking,
      // What the lookup actually turned up, so the panel can show a receipt
      // rather than a claim — and so a citation in the reply can be opened
      // and read rather than taken on trust. Computed here; nothing guessed.
      consulted: assessment.authority ?? [],
    };
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
/**
 * Read the whole intake and say how it reads (FR-43).
 *
 * The floor runs here with no model — it costs nothing and catches a
 * product name. Only what clears it is worth a model call.
 *
 * **It fails open at every step.** No agent, a slow agent, a wrong agent,
 * a partial answer, a thrown error: all pass. A quality assistant that
 * blocks submission has become a gate (G-69).
 */
/**
 * The fields a contradiction may be corrected on: those that offer a fixed
 * set of answers.
 *
 * Free text is deliberately excluded. A wrong sentence is rewritten with
 * the person watching; a wrong pick has exactly one right alternative and
 * can be checked against the instrument, which is what makes writing it on
 * their behalf safe at all.
 */
function correctableFields(): Array<{
  id: string;
  label: string;
  options: string[];
}> {
  const fields: Array<{ id: string; label: string; options: string[] }> = [];
  for (const section of INTAKE_SECTIONS) {
    for (const field of section.fields) {
      if (field.options && field.options.length > 0) {
        fields.push({
          id: field.id,
          label: field.label,
          options: field.options,
        });
      }
    }
  }
  return fields;
}

export async function checkIntake(
  projectId: string,
): Promise<Result<{ coherence: Coherence; rewritable: string[] }>> {
  try {
    const access = await openProject(projectId);
    if (!access.ok) {
      return failure(
        "checkIntake",
        new Error("not permitted"),
        "That assessment isn't yours to work on.",
        { retryable: false, expected: true },
      );
    }
    const values = intakeValuesFrom(
      access.project as unknown as Record<string, unknown>,
    );

    // The whole intake, read as one document. Coherence is a property of
    // the set — "internal tool" and a list of external recipients are only
    // in conflict when you read both. Blanks are NAMED here: an intake that
    // answered everything thinly grades differently from one that left half
    // of it empty.
    const document = [intakeAsDocument(values, { blanks: "named" })];
    const longForm = ALL_FIELDS.filter(
      (field) =>
        field.type === "textarea" &&
        String(values[field.id] ?? "")
          .trim()
          .split(/\s+/)
          .filter(Boolean).length > 8,
    ).map((field) => field.id);

    const description =
      typeof values.projectDescription === "string"
        ? values.projectDescription
        : "";
    const floor = belowFloor(description);
    if (floor) {
      return {
        ok: true as const,
        coherence: {
          score: null,
          outOf: 20,
          band: null,
          meaning: null,
          opening: null,
          checkedByModel: true,
          summary: null,
          conflicts: [],
          asks: [
            {
              id: "floor",
              label: "The description",
              level: 1 as Level,
              sentence: floor,
              anchor: "",
              why: "Everything downstream routes on what you write here.",
              routing: true,
              note: null,
              conflicts: [],
              conflictHeading: null,
              unquoted: null,
            },
          ],
        },
        rewritable: [],
      };
    }

    const transport = agentTransport();
    if (!transport.available) {
      return {
        ok: true as const,
        coherence: coherenceWhenUnavailable(),
        rewritable: [],
      };
    }
    const scoring = await transport.scoreIntake({
      description: document.join("\n"),
      fields: correctableFields(),
      dimensions: scoringBrief(),
    });
    return {
      ok: true as const,
      coherence: coherenceFrom(
        scoring.scores.map((s) => ({
          id: s.id,
          level: Math.min(4, Math.max(1, s.score)) as Level,
          ...(s.note ? { because: s.note } : {}),
        })),
        scoring.conflicts,
        scoring.summary,
      ),
      rewritable: longForm,
    };
  } catch (error) {
    // Even a thrown error passes. Nothing about checking a description is
    // worth stopping somebody over.
    console.error("[checkIntake]", error);
    return {
      ok: true as const,
      coherence: coherenceWhenUnavailable(),
      rewritable: [],
    };
  }
}

/** What a rewrite offers back. Never saved — the person decides. */
export type Suggestion = {
  rewrite: string;
  placeholders: string[];
  kept: string;
};

/**
 * Suggest a rewrite of one long-form intake field (FR-43).
 *
 * It reorganises what the person wrote and marks what is missing with a
 * bracketed placeholder — never an invented fact. Nothing is saved: the
 * suggestion goes back for them to edit, accept or ignore, and the grading
 * judges whatever they finally submit.
 */
export async function suggestRewrite(
  projectId: string,
  fieldId: string,
  shortfalls: Array<{ label: string; ask: string; anchor: string }>,
): Promise<
  Result<{
    suggestion: Suggestion | null;
    /** Why there is none, when there is none. Null when there is one. */
    why: "refused" | Trouble | null;
  }>
> {
  try {
    const access = await openProject(projectId);
    if (!access.ok) {
      return failure(
        "suggestRewrite",
        new Error("not permitted"),
        "That assessment isn't yours to work on.",
        { retryable: false, expected: true },
      );
    }
    const field = ALL_FIELDS.find((candidate) => candidate.id === fieldId);
    if (!field) {
      // The field must be one the instrument actually asks. A caller naming
      // anything else is not describing a field on their screen.
      return failure(
        "suggestRewrite",
        new Error("unknown field"),
        "That isn't a field on this form.",
        { retryable: false, expected: true },
      );
    }
    const values = intakeValuesFrom(
      access.project as unknown as Record<string, unknown>,
    );
    const original =
      typeof values[fieldId] === "string" ? (values[fieldId] as string) : "";
    if (original.trim() === "") {
      return failure(
        "suggestRewrite",
        new Error("nothing to rewrite"),
        "There is nothing written there yet to rewrite.",
        { retryable: false, expected: true },
      );
    }

    const transport = agentTransport();
    if (!transport.available) {
      return {
        ok: true as const,
        suggestion: null,
        why: "unreachable" as const,
      };
    }
    const outcome = await transport.rewriteIntake({
      label: field.label,
      original,
      shortfalls,
    });
    // "We looked and your text stands" and "we could not look" are
    // different things to be told, and only one of them is about them.
    if ("rewrite" in outcome) {
      return { ok: true as const, suggestion: outcome, why: null };
    }
    return { ok: true as const, suggestion: null, why: outcome.why };
  } catch (error) {
    return failure(
      "suggestRewrite",
      error,
      "I couldn't suggest anything just then. What you wrote is untouched.",
    );
  }
}
