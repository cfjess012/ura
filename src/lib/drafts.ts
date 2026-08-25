/**
 * What the record will accept from a model, and what it says about it.
 *
 * Pure: no framework, no driver, no environment (§26.1).
 *
 * Two things live here. The first is the **record's own gate** over a
 * proposed answer — the agent's gate protects the wire, this one protects
 * the table, and only one of them is on the side that owns the consequence
 * (G-65, G-66). It was written out longhand in the document-drafting action
 * and is extracted here because a second caller copying four checks is how
 * one of them quietly goes missing.
 *
 * The second is the sentence a person reads afterwards, and the reason it
 * is a **discriminated outcome rather than a count**: "I read it and it
 * does not settle this" and "I could not look" are different facts, and a
 * number cannot tell them apart. The document action already carries a
 * comment about exactly that collapse — it once reported "Every question
 * was already answered" when the service was simply unreachable.
 */
import { quoteAppearsVerbatim } from "./agent-contract";

/**
 * How an intake-grounded quote is named to the person who wrote it.
 *
 * The same string is sent to the agent as the source id and recorded as
 * `sourceRef`, because the drafting gate refuses a draft citing a source it
 * was not given. It reads after "From " on the proposal card, and it says
 * "what you wrote" rather than naming a document, because no document
 * exists — the evidence is their own description.
 */
export const INTAKE_SOURCE = "what you wrote when you described the activity";

/** A proposal as it arrives, before the record has had its say. */
export type ProposedDraft = {
  questionId: string;
  value: string | string[] | null;
  basis: string;
  quote?: string | null;
};

export type Admissible =
  | { ok: true; value: string }
  | { ok: false; why: "abstained" | "unquoted" | "not-open" | "not-an-answer" };

/**
 * Whether a proposed answer may be written.
 *
 * Abstention is first among the checks because it is not a failure: an
 * agent that answers from nothing has failed even when it happens to be
 * right, so `not_stated` is the correct outcome for a question the source
 * does not settle.
 */
export function admissibleDraft(
  draft: ProposedDraft,
  against: {
    text: string;
    open: ReadonlySet<string>;
    values: readonly string[];
  },
): Admissible {
  if (draft.basis === "not_stated" || draft.value === null) {
    return { ok: false, why: "abstained" };
  }
  if (!against.open.has(draft.questionId)) {
    // Answers are insert-only and the newest row wins, so a draft for a
    // question somebody already decided would arrive on top of their own
    // answer and show as a proposal over a decision they had made.
    return { ok: false, why: "not-open" };
  }
  if (!draft.quote || !quoteAppearsVerbatim(draft.quote, against.text)) {
    return { ok: false, why: "unquoted" };
  }
  if (
    typeof draft.value !== "string" ||
    !against.values.includes(draft.value)
  ) {
    // Dropped rather than coerced. A hedge sentence read as "No" is an
    // answer nobody gave, arriving under their name.
    return { ok: false, why: "not-an-answer" };
  }
  return { ok: true, value: draft.value };
}

/**
 * How a proposal attempt ended.
 *
 * Every branch is a different sentence because every branch is a different
 * fact. The rule this shape exists to enforce: **a sentence about a
 * person's work may only be printed on a path that actually examined it.**
 */
export type ProposalOutcome =
  | { outcome: "proposed"; proposed: number }
  /** We read their description and it does not settle this question. */
  | { outcome: "nothing-in-it" }
  | { outcome: "already-answered" }
  /**
   * Their description already settles it and the screen shows it pre-filled.
   * Distinct from `already-answered`, because nobody answered it — the
   * intake did, and telling somebody they answered a question they were
   * never asked is exactly the claim G-42 exists to stop.
   */
  | { outcome: "already-settled" }
  /** No gate question on this screen — nothing to propose against. */
  | { outcome: "not-here" }
  | { outcome: "refused"; because: string }
  /** We never got to look. Says nothing whatever about their writing. */
  | { outcome: "unreachable" };

/**
 * What to say about it, appended to the model's own reply.
 *
 * Composed here and stored as part of the agent's turn, so a person who
 * reloads reads the conversation they actually had. None of these claim an
 * act — "recorded", "saved", "submitted", "signed" — both because the
 * conversation gate rejects a reply that does and because none of them
 * would be true: a proposal is not an answer until somebody accepts it.
 */
export function proposalSentence(outcome: ProposalOutcome): string {
  switch (outcome.outcome) {
    case "proposed":
      return "I have put a suggested answer on this question, with the sentence from your own description it came from. It is not your answer until you accept it.";
    case "nothing-in-it":
      // Earned: this path ran the model over their text.
      return "I read back through what you wrote when you described the activity, and it does not settle this one either way. It is yours to answer.";
    case "already-answered":
      return "You have answered this one already, and I would rather not put a suggestion over your own answer.";
    case "already-settled":
      return "What you wrote at intake already settles this one, which is why it is filled in below — it just wants your confirmation, and that has to be your click rather than mine.";
    case "not-here":
      return "I can only suggest an answer on a risk-area question — this screen is not one of them.";
    case "refused":
      return outcome.because;
    case "unreachable":
      // No verb about reading, and no mention of their description: nothing
      // examined it, so nothing may be said about it.
      return "I could not get to that just then, so I have not suggested anything. Nothing you have written was affected, and the question works as normal.";
  }
}
