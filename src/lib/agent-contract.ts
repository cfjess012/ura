/**
 * The wire contract between the web application and the agent service.
 *
 * This is a **deployment boundary**: the two sides ship as separate images
 * and can be at different versions at the same moment. Changing anything
 * here is a compatibility event, not a refactor — treat it the way you
 * would treat a public API.
 *
 * It lives in its own module, imported by both sides, so there is exactly
 * one definition of what crosses the wire. No framework types, no driver
 * types, nothing that cannot survive JSON.
 */

/** Everything the agent may be asked to do. One name per capability. */
export type AgentTask =
  /** Draft answers for a set of questions from evidence the requester gave. */
  | "draft"
  /** Explain why a question is being asked, in the person's own terms. */
  | "explain";

/** What the caller sends. Identifiers only — never a database row. */
export type AgentRequest = {
  task: AgentTask;
  /** The assessment this is about. The agent never chooses one. */
  projectId: string;
  /** The conversation this belongs to, for continuity across turns. */
  conversationId: string;
  /** Question ids in scope. Empty means "the agent proposes the scope". */
  questionIds: string[];
  /** Free text the requester supplied for this turn, if any. */
  said?: string;
};

/**
 * How an answer is grounded. Three values, and the third is the important
 * one: **abstention is a first-class outcome, not a failure.** An agent
 * that answers from nothing has failed even when it happens to be right.
 *
 * Salvaged from the prior platform, which got this shape right (G-63).
 *
 * - `stated` — the source directly asserts it. The quote alone, read by
 *   somebody who has seen nothing else, answers the question.
 * - `inferred` — it follows from the source by one short, defensible step,
 *   and that step is written down. **An inference still carries a quote**;
 *   an inference with nothing to point at is a guess.
 * - `not_stated` — the source does not support an answer. Value, quote and
 *   source are all absent, and saying so is the correct behaviour.
 */
export type Basis = "stated" | "inferred" | "not_stated";

/**
 * A drafted answer. It is a **proposal**, and the type says so: there is no
 * field on it that could record an attestation, because drafting something
 * and signing it are different acts by different parties (SPEC §7, §4.2).
 */
export type DraftedAnswer = {
  questionId: string;
  basis: Basis;
  /** The value being proposed. Null when the basis is `not_stated`. */
  value: string | string[] | null;
  /**
   * The passage this came from, copied exactly. Never a paraphrase — the
   * receiving side verifies it appears in the source it was drawn from, and
   * a quote that does not is an error, not a lower-confidence answer. Null
   * only when the basis is `not_stated`.
   */
  quote: string | null;
  /** Where the quote came from, as a person would name it. */
  source: string | null;
  /**
   * Why this is being proposed, in words a requester can judge — including,
   * for an inference, the reasoning step itself. Never a score: a number a
   * person cannot check is a number that replaces their judgement.
   */
  because: string;
};

/**
 * The never-guess rule, in one place (SPEC §7).
 *
 * Returns what is wrong with a drafted answer, or null if it is properly
 * grounded. The prior platform enforced this three times over — a pure
 * function, the agent's own gate, and CHECK constraints — and that is the
 * right number, because each catches what the others cannot: this one
 * catches it before a person sees it, the gate catches it before it is
 * recorded, and the database catches it whatever calls it.
 */
export function violatesNeverGuess(answer: {
  basis: Basis;
  value: string | string[] | null;
  quote: string | null;
  source: string | null;
}): string | null {
  if (answer.basis === "not_stated") {
    if (
      answer.value !== null ||
      answer.quote !== null ||
      answer.source !== null
    ) {
      return "An abstention carries no answer, no quote and no source — saying nothing was found means finding nothing.";
    }
    return null;
  }
  if (answer.quote === null || answer.source === null) {
    return `A ${answer.basis} answer must carry the passage it came from, and where that passage is from. An inference with nothing to point at is a guess.`;
  }
  if (answer.value === null) {
    return `A ${answer.basis} answer must propose a value; abstaining is what not_stated is for.`;
  }
  return null;
}

/** Streamed back as NDJSON, one event per line. */
export type AgentEvent =
  /** Something to show a person while they wait. */
  | { type: "thinking"; text: string }
  /**
   * A proposal. Never applied by the agent; the person confirms it. An
   * abstention arrives as a draft too, with basis `not_stated` — there is
   * no separate event for it, because a separate event invites a caller to
   * handle one and ignore the other.
   */
  | { type: "draft"; answer: DraftedAnswer }
  /** A receipt: exactly what was recorded, and what was not. */
  | { type: "receipt"; recorded: string[]; notRecorded: string[]; next: string }
  /** Something went wrong, said in a sentence with a next step. */
  | { type: "error"; message: string; retryable: boolean }
  /** The turn is over. */
  | { type: "done" };

/** The contract version, sent on every request so a mismatch is visible. */
export const AGENT_CONTRACT_VERSION = "1";

/**
 * Parse one NDJSON line into an event, or null if it is not one.
 *
 * Deliberately strict: an unrecognised event is dropped rather than passed
 * through as an object of unknown shape. A newer agent streaming an event
 * this web app does not understand must not be able to put arbitrary
 * content on a person's screen.
 */
export function parseAgentEvent(line: string): AgentEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const event = parsed as { type?: unknown };
  switch (event.type) {
    case "thinking":
    case "draft":
    case "abstained":
    case "receipt":
    case "error":
    case "done":
      return parsed as AgentEvent;
    default:
      return null;
  }
}

/**
 * Collapse every run of whitespace to one space. Presentation-only
 * differences — a hard-wrapped document, a pasted line break — must not
 * make a quote fail, while any change to the actual words must.
 */
export function normaliseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * True when `quote` appears verbatim inside `source`, ignoring how the
 * whitespace happens to fall.
 *
 * **There is one of these and there must only ever be one.** The gate that
 * rejects a bad draft, the eval scorer, and the panel that highlights the
 * passage on screen all ask this same function. A second matcher anywhere
 * means a quote can pass the gate and then fail to highlight — provenance
 * appearing broken at the exact moment somebody checks it.
 *
 * An empty quote never matches: an empty string is not evidence.
 */
export function quoteAppearsVerbatim(quote: string, source: string): boolean {
  const needle = normaliseWhitespace(quote);
  if (needle.length === 0) return false;
  return normaliseWhitespace(source).includes(needle);
}

/**
 * The assessment record an agent is allowed to see, and the only thing it
 * may speak about.
 *
 * Deliberately not database rows. Every field here is already in the words a
 * person would recognise, because the moment an agent is handed an internal
 * identifier it will eventually say one out loud — and a requester told
 * "t3.t3_iam_02 is unanswered" has been handed the system's problem instead
 * of an answer (§24.2, NFR-9).
 *
 * It is also the thing the output is checked against. An agent that cannot
 * be told what is on record cannot be caught claiming something that is not.
 */
export type AssessmentContext = {
  projectId: string;
  /** The activity, as the person described it. Never a summary we wrote. */
  activity: string;
  /** What is on record — label and value, exactly as displayed. */
  onRecord: Array<{ label: string; value: string }>;
  /** What is still open, in the question's own words. */
  openQuestions: string[];
};

/**
 * Shapes that are ours and must never reach a person: question ids, control
 * objective codes, severity codes, and the `initial.surname` form the pilot
 * directory uses for people.
 */
const INTERNAL_IDENTIFIER =
  /\b(?:t3|sev|gate|path)\.[a-z0-9_]+\b|\b T?[23]-[A-Z]{2,4}-\d{1,2}\b|\bT[23]-[A-Z]{2,4}-\d{1,2}\b/;

/**
 * An internal identifier the agent said out loud, or null.
 *
 * This is the guardrail most likely to fire in practice, because the model
 * is handed ids in its own instructions and repeating one feels helpful.
 */
export function utteredInternalIdentifier(text: string): string | null {
  const found = text.match(INTERNAL_IDENTIFIER);
  return found ? found[0].trim() : null;
}

/**
 * An answer the agent attributed to the person that is not on the record,
 * or null.
 *
 * G-42, enforced rather than asked for: never state as somebody's answer a
 * thing they were not asked. The failure this catches is specific and
 * plausible — a model recapping "you said the data is Confidential" when
 * they said no such thing, which a busy person will read as confirmation
 * and stop checking.
 */
export function claimsUnrecordedAnswer(
  text: string,
  context: AssessmentContext,
): string | null {
  // "you answered X", "you said X", "you told us X", "you selected X".
  const claims = [
    ...text.matchAll(
      /\byou (?:answered|said|told us|selected|chose)\b([^.!?\n]{0,120})/gi,
    ),
  ];
  for (const claim of claims) {
    const claimed = (claim[1] ?? "").trim();
    if (claimed === "") continue;
    const supported = context.onRecord.some(
      (entry) =>
        entry.value.trim() !== "" &&
        normaliseWhitespace(claimed.toLowerCase()).includes(
          normaliseWhitespace(entry.value.toLowerCase()),
        ),
    );
    if (!supported) return claimed;
  }
  return null;
}

/**
 * Everything wrong with something an agent is about to say to a person,
 * checked against the record it was given. Null when it may be shown.
 *
 * One function, so a new capability cannot ship with half the checks: the
 * drafting pass and the conversation both call exactly this.
 */
export function contextualGuardrail(
  text: string,
  context: AssessmentContext,
): string | null {
  const identifier = utteredInternalIdentifier(text);
  if (identifier) {
    return `it said "${identifier}" to a person — an internal identifier is our problem, not theirs`;
  }
  const unrecorded = claimsUnrecordedAnswer(text, context);
  if (unrecorded) {
    return `it attributed an answer to the person that is not on the record: "${unrecorded}"`;
  }
  return null;
}
