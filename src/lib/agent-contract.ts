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
  /**
   * The questions themselves, with the material each may be drafted from.
   * Sent rather than looked up, because the agent service has no database
   * and must not grow one — it knows how to judge a quote against a source,
   * not what an assessment is.
   */
  questions?: Array<{
    questionId: string;
    question: string;
    answerShape: string;
    assessment: AssessmentContext;
    sources: Array<{ id: string; text: string }>;
  }>;
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
 * Shapes that are ours and must never reach a person.
 *
 * Widened after verification found the first version catching almost
 * nothing real: it knew `t3.foo` and `T3-IAM-02` and missed `p.requester`,
 * `TPR_LA`, `AI_DEC`, and anything upper-cased. Every pattern below is a
 * shape that exists in this system's own data.
 */
const INTERNAL_IDENTIFIER_PATTERNS: RegExp[] = [
  // Question ids: t3.t3_iam_02, sev.tpr_la_1, gate.ai, path.security
  /\b(?:t3|sev|gate|path)\.[a-z0-9_]+\b/i,
  // Objective and severity codes: T3-IAM-02, T2-TPR-1
  /\bT[23]-[A-Z]{2,5}-\d{1,2}\b/i,
  // Path codes: TPR_LA, AI_DEC, SR_INT — upper-case with an underscore
  /\b[A-Z]{2,5}_[A-Z]{2,6}\b/,
  // Person ids: p.requester, d.grant, a.security. `e.g.` and `i.e.` are
  // ordinary prose and must not trip this.
  /\b(?!e\.g|i\.e)[a-z]\.[a-z]{3,}\b/,
  // Anything's uuid.
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
];

/**
 * An internal identifier the agent said out loud, or null.
 *
 * This is the guardrail most likely to fire in practice, because the model
 * is handed ids in its own instructions and repeating one feels helpful.
 */
export function utteredInternalIdentifier(text: string): string | null {
  for (const pattern of INTERNAL_IDENTIFIER_PATTERNS) {
    const found = text.match(pattern);
    if (found) return found[0].trim();
  }
  return null;
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
  // Verbs a model actually uses, and the apostrophes it actually types.
  // Widened twice: the first version knew five verbs, the second missed a
  // curly apostrophe and any adverb between "you" and the verb.
  const CLAIM =
    /\byou(?:['\u2019]ve| have)?\s+(?:\w+\s+)?(?:answered|said|told us|selected|chose|indicated|confirmed|marked|noted|stated|mentioned|wrote|entered|picked|described)\b(.*)$/i;

  // Matched as whole words, never as substrings. A containment test over
  // "No" — on record in every assessment — passed any clause containing
  // "nothing", "not", "none" or "know", which made the whole check
  // ornamental for short values.
  const values = context.onRecord
    .map((entry) => normaliseWhitespace(entry.value.toLowerCase()))
    .filter((value) => value !== "");

  const saysValue = (clause: string, value: string): boolean => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|\\W)${escaped}(?:\\W|$)`, "i").test(clause);
  };

  // Split on every conjunction and separator a model joins clauses with.
  // Fixing only "and" left the named failure — one true clause laundering
  // a false one — alive behind "but", a comma and a semicolon.
  const clauses = text
    .split(/[.!?\n;,]|\band\b|\bbut\b/i)
    .map((clause) => clause.trim())
    .filter((clause) => clause !== "");

  for (const clause of clauses) {
    const claim = clause.match(CLAIM);
    if (!claim) continue;
    const claimed = normaliseWhitespace((claim[1] ?? "").trim().toLowerCase());
    if (claimed === "") continue;
    if (!values.some((value) => saysValue(claimed, value))) return claimed;
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
