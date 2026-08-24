/**
 * How closely an answer needs looking at — mechanically (S8, G-61).
 *
 * Salvaged from the prior platform (G-8, parts-shelf decision #4). Its own
 * opening comment is why it was worth taking, and it is kept verbatim
 * because it is the design:
 *
 *   "Deliberately NOT a model self-report: LLM confidence estimates are
 *    uncalibrated, and a number the system cannot verify would be the one
 *    dishonest pixel in a product built on mechanical gates. Every
 *    criterion here is a checkable fact with a receipt, and the rollup is
 *    three bands, not a percentage — bands resist the false precision a
 *    '7.2/10' invites."
 *
 * **The band is a review-priority signal only.** It orders the reviewer's
 * queue and does nothing else: it may never gate, skip or pre-approve an
 * attestation, because every answer needs its human (§5.5). It grades how
 * well-supported an answer is — never how risky the activity is, which is
 * the separate and still-open scoring question (§14).
 *
 * **What changed on the way over.** The original grades AI-drafted answers
 * against quoted sources: basis, quote shape, run-to-run stability. This
 * product has no drafting yet, so those criteria would be a rubric with no
 * inputs. The criteria here are facts this instrument actually has today —
 * and the three-valued `pass` the original already used (`null` = not
 * knowable here) is exactly how the drafting criteria arrive later without
 * changing the shape. Building it now is deliberate: §7's contract is
 * normative while dormant, so the drafting layer lands into something that
 * already knows how to be graded.
 *
 * Pure, computed at read time from stored facts: no model call, no prompt,
 * nothing stored, recomputable if the rubric changes (§26.1, NFR-3).
 */

export type ReviewBand = "routine" | "worth-a-look" | "verify-closely";

export interface ReviewCriterion {
  id: string;
  label: string;
  /** true supports the answer, false counts against it, null = unknowable here. */
  pass: boolean | null;
  detail: string;
}

export interface ReviewInput {
  /** Yes / Partial / No / N-A, as the person answered it. */
  answer: "Yes" | "Partial" | "No" | "N-A";
  /** What they wrote alongside it. Empty for a Yes, which needs none. */
  note: string;
  /** Was this question handed to a risk assessor because nobody could answer it? */
  wasHandedOff: boolean;
  /** How many times this question has been answered. Insert-only, so we know. */
  timesAnswered: number;
  /** A control answered Yes whose children were all left unanswered. */
  childrenUnanswered: number;
  /**
   * Whether the drafting layer produced this answer, once it exists (§7).
   * `null` until then — unknowable, which is not a failure.
   */
  draftedWithEvidence: boolean | null;
}

export interface ReviewResult {
  band: ReviewBand;
  criteria: ReviewCriterion[];
}

export const REVIEW_BAND_LABEL: Record<ReviewBand, string> = {
  routine: "Routine",
  "worth-a-look": "Worth a look",
  "verify-closely": "Verify closely",
};

/** A note that is a sentence, not a shrug and not a dump. */
const NOTE_MIN_WORDS = 4;
const NOTE_MAX_WORDS = 120;

/**
 * Grade one answer. Returns null when there is nothing to grade — an
 * unanswered question is not a weak answer, it is an absent one, and a
 * rubric over it would be noise. (The original's rule, kept: it did the
 * same for abstentions.)
 */
export function reviewRubric(input: ReviewInput): ReviewResult | null {
  if (input.timesAnswered === 0) return null;

  const noteWords = input.note.trim().split(/\s+/).filter(Boolean).length;
  const noteNeeded = input.answer !== "Yes";
  const noteSubstantive = noteWords >= NOTE_MIN_WORDS && noteWords <= NOTE_MAX_WORDS;

  const criteria: ReviewCriterion[] = [
    {
      id: "note",
      label: "Explained in the person's own words",
      pass: noteNeeded ? noteSubstantive : null,
      detail: !noteNeeded
        ? "A Yes stands on its own — there is no note to weigh."
        : noteSubstantive
          ? `${noteWords} words — enough to act on.`
          : noteWords < NOTE_MIN_WORDS
            ? `${noteWords} words — too short to tell you what is actually missing.`
            : `${noteWords} words — a long passage; check which part is the answer.`,
    },
    {
      id: "handoff",
      label: "Answered by the person who owns the activity",
      pass: !input.wasHandedOff,
      detail: input.wasHandedOff
        ? "This was handed to a risk assessor because the requester could not answer it."
        : "Answered directly, without being handed over.",
    },
    {
      id: "settled",
      label: "Settled on one answer",
      pass: input.timesAnswered <= 2,
      detail:
        input.timesAnswered <= 2
          ? "Answered once, or corrected once."
          : `Changed ${input.timesAnswered - 1} times — the person was unsure.`,
    },
    {
      id: "children",
      label: "The detail behind it was filled in",
      pass: input.answer === "Yes" ? input.childrenUnanswered === 0 : null,
      detail:
        input.answer !== "Yes"
          ? "Only a Yes opens the detailed questions."
          : input.childrenUnanswered === 0
            ? "Every detailed question underneath was answered."
            : `${input.childrenUnanswered} of the detailed questions underneath were left unanswered.`,
    },
    {
      id: "drafted",
      label: "Grounded in a quoted source",
      pass: input.draftedWithEvidence,
      detail:
        input.draftedWithEvidence === null
          ? "Nothing drafts answers yet, so there is no evidence trail to weigh."
          : input.draftedWithEvidence
            ? "Drafted from a quoted source and confirmed by the person."
            : "Typed by the person with no source cited.",
    },
  ];

  // Floors first: any of these makes "verify closely" the only honest band,
  // whatever the points say. Kept from the original, which is where the
  // idea of a floor came from.
  // Any answer that is not a Yes owes an explanation, and one that does not
  // give one cannot be acted on — which is the whole reason §3.4 demands
  // the note. S6 already refuses an empty one; a one-word one gets through,
  // and that is exactly what a reviewer needs pointed at.
  const unexplained = noteNeeded && !noteSubstantive;
  const unsure = input.timesAnswered > 2;
  const hollowYes = input.answer === "Yes" && input.childrenUnanswered > 0;
  if (unexplained || unsure || hollowYes) {
    return { band: "verify-closely", criteria };
  }

  let score = 0;
  score += input.answer === "Yes" ? 2 : 1;
  score += !noteNeeded || noteSubstantive ? 1 : 0;
  score += input.wasHandedOff ? 0 : 1;
  score += input.draftedWithEvidence === true ? 1 : 0;

  const band: ReviewBand = score >= 4 ? "routine" : score >= 2 ? "worth-a-look" : "verify-closely";
  return { band, criteria };
}

/** Queue order: what needs a person most, first. */
export const BAND_ORDER: Record<ReviewBand, number> = {
  "verify-closely": 0,
  "worth-a-look": 1,
  routine: 2,
};
