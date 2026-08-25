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
  /**
   * What the person is looking at **right now**, in human words.
   *
   * Without this the assistant knows which assessment somebody is on and
   * not which screen, so "what does this mean?" has no referent and it
   * answers about the assessment in general. That is the difference
   * between a thought partner and a search box.
   */
  /**
   * The standard the intake is graded against, when they are writing it.
   *
   * Without this the assistant does not know the description is graded at
   * all, and calls a one-line answer a solid start — praise the check then
   * contradicts, from a rubric nobody showed either of them. Sent only on
   * the intake screens, because it is the only place it applies.
   */
  /**
   * Where the assessment stands, in one sentence.
   *
   * Every page works this out for its own header and none of it reached
   * the assistant, so asked "what next?" it described the question in front
   * of somebody and not the journey around it. It is the record's answer,
   * not the screen's.
   */
  standing?: string;
  graded?: Array<{ criterion: string; fullMarks: string }>;
  /**
   * Clauses from the organisation's own policies that bear on what they
   * asked, quoted verbatim.
   *
   * The one legitimate exception to the evidence line (§22.5): a policy is
   * not world knowledge, and it may ground a definition or a requirement.
   * It may still never assert a fact about this project — the policy says
   * what a term means, the requester says whether it is true of theirs.
   */
  authority?: Array<{
    policy: string;
    reference: string;
    version: string;
    clauseId: string;
    heading: string;
    text: string;
  }>;
  looking?: {
    /** The screen, named the way a person would name it. */
    screen: string;
    /** The questions actually in front of them, verbatim. */
    questions: string[];
  };
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
/** Words too ordinary to count as evidence a claim came from their text. */
const CLAIM_NOISE = new Set([
  "that",
  "this",
  "they",
  "them",
  "there",
  "here",
  "with",
  "from",
  "have",
  "been",
  "were",
  "your",
  "will",
  "would",
  "which",
  "when",
  "what",
  "into",
  "also",
  "some",
  "such",
  "than",
  "then",
  "only",
  "just",
  "about",
]);

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

  /**
   * Long enough that finding it inside a recorded value means something.
   * Below this a fragment like "that" or "it is" appears in almost any
   * paragraph, which would launder a false claim on the strength of a
   * preposition.
   */
  const ENOUGH_TO_QUOTE = 12;
  /**
   * And at least two words. Length alone was the wrong measure: "managers
   * review" is fifteen characters, verbatim in what they wrote, and was
   * refused for being short — while a long enough run of filler would have
   * passed. Two words plus twelve characters is a phrase; one word is a
   * coincidence waiting to happen.
   */
  const ENOUGH_WORDS = 2;

  const saysValue = (clause: string, value: string): boolean => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // The recorded value appears in what was said. Whole words, never a
    // substring: a containment test over "No" — on record in every
    // assessment — passed any clause containing "nothing", "not", "none"
    // or "know", which made the check ornamental for short values.
    if (new RegExp(`(?:^|\\W)${escaped}(?:\\W|$)`, "i").test(clause)) {
      return true;
    }
    // Or what was said appears in the recorded value — the other
    // direction, and the one that matters for anything long. A description
    // is a single recorded value of several hundred words, so quoting one
    // true sentence of it back can never contain the whole thing. Without
    // this the assistant cannot say "you wrote X" about the person's own
    // description, which is the most useful and most checkable sentence it
    // has. Bounded by length so a fragment cannot launder a claim.
    // "You wrote THAT claim narratives are…" — the conjunction and any
    // wrapping quote marks belong to the sentence about the quote, not to
    // the quote itself.
    const whole = clause
      .replace(/^(?:that|how|it|this|the)\s+/i, "")
      .replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, "")
      .trim();
    const substantial = (text: string) =>
      text.length >= ENOUGH_TO_QUOTE &&
      text.trim().split(/\s+/).filter(Boolean).length >= ENOUGH_WORDS;
    if (substantial(whole) && value.includes(whole)) return true;

    // Or a span it put in quote marks appears in the value. This is the
    // ordinary shape of a grounded sentence — "the workflow is 'processed
    // via OpenAI's API'" — where the frame around the quotation is the
    // model's paraphrase and only the quoted part claims to be theirs.
    // Judging the paraphrase would reject every true citation.
    for (const found of clause.matchAll(
      /["\u201c]([^"\u201d]+)["\u201d]|['\u2018]([^'\u2019]+)['\u2019]/g,
    )) {
      const span = (found[1] ?? found[2] ?? "").trim();
      if (substantial(span) && value.includes(span)) return true;
    }
    return false;
  };

  /**
   * Or the claim is built out of words they actually wrote.
   *
   * The check exists to stop one sentence: "you said the data is
   * Confidential" when they said no such thing, read as confirmation by
   * somebody busy. That is a claim about an ANSWER. What it kept refusing
   * instead was a fair recap of their own description — "you described
   * handlers entering claim descriptions" — which shares nearly every word
   * with what they wrote and invents nothing.
   *
   * G-65 warned about exactly this: the conversational gate is deliberately
   * narrower than the drafting gate, because holding a thought partner to
   * the verbatim standard makes a thought partner impossible. It was not
   * narrow enough — three replies in a row were destroyed by it in one
   * sitting, and the person saw "something went wrong on my side" each
   * time.
   *
   * So: most of a claim's content words being theirs is enough. An
   * invention fails it — "hosted entirely in our own datacentre" shares
   * almost nothing with a record that never mentions hosting — while a
   * paraphrase passes, which is the correct outcome for conversation.
   */
  const SHARED_ENOUGH = 0.6;
  const everything = values.join(" ");
  const mostlyTheirWords = (clause: string): boolean => {
    const words = clause
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3 && !CLAIM_NOISE.has(word));
    if (words.length < 2) return false;
    const theirs = words.filter((word) => everything.includes(word)).length;
    return theirs / words.length >= SHARED_ENOUGH;
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
    // A clause with no actual words in it asserts nothing. "You said:" with
    // the quote on the next line captured ":" and was refused as a false
    // claim — punctuation cannot attribute anything to anybody.
    if (claimed.replace(/[^a-z0-9]/g, "") === "") continue;
    if (values.some((value) => saysValue(claimed, value))) continue;
    if (mostlyTheirWords(claimed)) continue;
    return claimed;
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
