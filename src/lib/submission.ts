/**
 * S7 — submission, the declaration, and the findings it synthesises.
 *
 * Three rules live here, and each exists because the alternative is a lie
 * on screen or in the record:
 *
 * - **Gaps are named, not counted** (FR-14). "12 questions unanswered" is a
 *   number nobody can act on; the person confirms a list in the questions'
 *   own words, and the same list is stored with the declaration.
 * - **The declaration records what was SHOWN** (FR-37, G-52). A record that
 *   only says "they confirmed" is worthless once the answers move on. This
 *   keeps the label and value as displayed, so a reviewer can see whether
 *   the record still matches what was signed.
 * - **Findings are derived from Tier-3 answers** (FR-15): No becomes a
 *   control gap, Partial becomes an enhancement, and each carries the note
 *   the person wrote — a finding without it is not actionable.
 *
 * Pure: no framework, no driver, no environment (§26.1).
 */
import type { Tier3Answer, Tier3Objective, Tier3Value } from "./tier3";
import { breachesIn } from "./policy";
import { childrenAsked } from "./tier3";
import type { AnswerLookup } from "./conditions";
import { ALL_FIELDS, type IntakeField } from "./intake";
import { labelOf, type ReferenceAnswer } from "./reference";

/** A question a person has not answered, in its own words. */
export type Gap = { questionId: string; label: string };

/** One line of what the submitter declared accurate. */
export type Declared = { questionId: string; label: string; value: string };

/** What submission turns a Tier-3 answer into (§4.3). */
export type FindingKind = "gap" | "enhancement" | "non-compliance";

/** The clause a non-compliance breaches — shown beside the answer. */
export type FindingCitation = {
  policyRef: string;
  clauseId: string;
  clauseText: string;
  expected: string;
};

export type SynthesisedFinding = {
  questionId: string;
  objective: string;
  objectiveName: string;
  kind: FindingKind;
  note: string;
  /** Present exactly when the kind is a non-compliance. */
  citation?: FindingCitation;
};

/**
 * Which Tier-3 answers become findings, and of which kind.
 *
 * Yes and N-A produce nothing: Yes is the control existing, and N-A is a
 * justified claim that it does not apply — that justification is the
 * reviewer's to test, not a finding against the activity.
 */
const KIND: Partial<Record<Tier3Answer, FindingKind>> = {
  No: "gap",
  Partial: "enhancement",
};

export function findingKindFor(answer: Tier3Answer): FindingKind | null {
  return KIND[answer] ?? null;
}

/**
 * Findings from the Tier-3 answers on record (FR-15).
 *
 * Only questions actually asked: a child whose parent is not Yes was never
 * put to this person, so an old answer to it is history, not a finding
 * (§3.4, and the same rule that makes it unanswerable at S6).
 */
export function synthesiseFindings(
  required: Tier3Objective[],
  values: Record<string, Tier3Value | undefined>,
  answers: AnswerLookup,
): SynthesisedFinding[] {
  const found: SynthesisedFinding[] = [];
  for (const objective of required) {
    const parent = values[objective.questionId];
    const consider = (questionId: string, value: Tier3Value | undefined) => {
      if (!value) return;
      const kind = findingKindFor(value.answer);
      if (!kind) return;
      // Where a policy governs this question, the breach IS the finding —
      // richer than a bare gap and carrying the authority with it. Raising
      // both would report one fact twice and make the queue noisier for no
      // extra information.
      const breach = breachesIn(
        { [questionId]: { answer: value.answer, note: value.note } },
        [questionId],
      )[0];
      found.push({
        questionId,
        objective: objective.id,
        objectiveName: objective.name,
        kind: breach ? "non-compliance" : kind,
        note: value.note.trim(),
        citation: breach
          ? {
              policyRef: breach.policyReference,
              clauseId: breach.clauseId,
              clauseText: breach.clauseText,
              expected: breach.expected,
            }
          : undefined,
      });
    };
    consider(objective.questionId, parent);
    for (const child of childrenAsked(
      objective,
      parent?.answer ?? null,
      answers,
    )) {
      consider(child.questionId, values[child.questionId]);
    }
  }
  return found;
}

/**
 * Everything still unanswered, named (FR-14).
 *
 * Submission with gaps is allowed and explicit: the person confirms this
 * list, and it is stored with the declaration so a reviewer sees exactly
 * what was known to be missing at the time.
 */
export function gapsIn(
  required: Tier3Objective[],
  values: Record<string, Tier3Value | undefined>,
  answers: AnswerLookup,
  /**
   * Everything unanswered EARLIER in the journey — gates that were never
   * answered, severity questions with no band, questions handed to someone
   * else. Without these the declaration counted only Tier 3, and Tier-3
   * questions exist only for controls that ACCUMULATED — so the less of an
   * assessment was done, the fewer gaps it reported, and an assessment with
   * nothing answered at all declared itself complete (verifier B1).
   */
  earlier: Gap[] = [],
): Gap[] {
  const gaps: Gap[] = [...earlier];
  for (const objective of required) {
    const parent = values[objective.questionId];
    if (!parent) {
      gaps.push({ questionId: objective.questionId, label: objective.text });
      continue;
    }
    for (const child of childrenAsked(objective, parent.answer, answers)) {
      if (!values[child.questionId]) {
        gaps.push({ questionId: child.questionId, label: child.text });
      }
    }
  }
  return gaps;
}

/**
 * What stops a submission entirely, as opposed to what merely needs
 * confirming. Gaps are confirmable; a missing declaration is not.
 */
export function submissionProblem(input: {
  alreadySubmitted: boolean;
  declaredCount: number;
  expectedCount: number;
  gapsAcknowledged: boolean;
  gapCount: number;
}): string | null {
  if (input.alreadySubmitted) {
    return "This assessment has already been submitted. Submitting is a one-way act.";
  }
  if (input.expectedCount === 0) {
    return "There is nothing to declare yet — complete the intake first.";
  }
  if (input.declaredCount !== input.expectedCount) {
    return "The answers shown have changed since this page was opened. Reload and read them again before declaring them accurate.";
  }
  if (input.gapCount > 0 && !input.gapsAcknowledged) {
    return `${input.gapCount} question${input.gapCount === 1 ? "" : "s"} ${input.gapCount === 1 ? "is" : "are"} unanswered. Confirm the list before submitting.`;
  }
  return null;
}

/** Whether an assessment is a draft or with a reviewer (§4.1). */
export function stageOf(submittedAt: Date | null): "Draft" | "In review" {
  return submittedAt === null ? "Draft" : "In review";
}

/**
 * A submitted assessment is read-only to its requester. Not a courtesy: an
 * answer changed after submission would make the declaration describe a
 * record that no longer exists.
 */
export function editableAfter(submittedAt: Date | null): boolean {
  return submittedAt === null;
}

/**
 * What the submitter is asked to declare accurate (FR-37, G-52).
 *
 * The eight required intake answers, each shown as a label and the value as
 * it appears on screen — never an id. One list, one confirmation: eight
 * separate tick-boxes is ceremony people click through without reading,
 * which is the opposite of what a declaration is for (owner's call).
 */
export function declarableFrom(values: Record<string, unknown>): Declared[] {
  // NOTE: pass the PROJECT ROW, not `intakeValuesFrom()`'s output. That
  // helper deliberately flattens a reference answer to its bare id so a
  // form can pre-select it, which made this record say "d.chen" and
  // "BU_OPS" — internal identifiers on screen (NFR-9) and, worse, in
  // `declarations.shown`, which is the durable evidence a reviewer reads
  // six months later (verifier B2).
  const shown = (field: IntakeField, raw: unknown): string => {
    if (raw === null || raw === undefined || raw === "") return "";
    if (Array.isArray(raw)) {
      return raw
        .map((item) =>
          typeof item === "object" && item !== null
            ? labelOf(item as ReferenceAnswer)
            : String(item),
        )
        .join(", ");
    }
    if (typeof raw === "object") return labelOf(raw as ReferenceAnswer);
    return String(raw);
  };
  return ALL_FIELDS.filter((field) => field.required).map((field) => ({
    questionId: field.id,
    label: field.label,
    value: shown(field, values[field.id]),
  }));
}

/**
 * Whether the answers a person declared still match the record.
 *
 * The declaration is about what they READ. If an answer moved between the
 * page rendering and the form posting, their confirmation describes
 * something that no longer exists — so the submission is refused and they
 * are asked to read it again, rather than being recorded as having
 * declared something they never saw (G-42's rule, at the moment it matters
 * most).
 */
export function declarationMatches(
  shown: Declared[],
  current: Declared[],
): boolean {
  if (shown.length !== current.length) return false;
  // Every question exactly once. Length plus per-entry equality let a
  // payload repeat one answer and omit another — nine entries, all
  // matching, with the data-classification answer simply absent from the
  // record (verifier B4).
  const seen = new Set(shown.map((d) => d.questionId));
  if (seen.size !== shown.length) return false;
  const byId = new Map(current.map((d) => [d.questionId, d.value]));
  if (byId.size !== current.length) return false;
  return shown.every(
    (d) => byId.has(d.questionId) && byId.get(d.questionId) === d.value,
  );
}

/**
 * What is unanswered before Tier 3 even begins: risk areas never answered,
 * severity questions with no band, and questions currently with someone
 * else. Each named in its own words, because a gap a person cannot read is
 * a gap they cannot act on (FR-14).
 */
export function earlierGaps(input: {
  gates: {
    category: { key: string; name: string; text: string };
    answer: string | null;
    settled: boolean;
  }[];
  severity: {
    questionId: string;
    name: string;
    text: string;
    answered: boolean;
  }[];
  handedOff: { questionId: string; label: string }[];
}): Gap[] {
  const gaps: Gap[] = [];
  for (const gate of input.gates) {
    if (gate.settled || gate.answer !== null) continue;
    gaps.push({
      questionId: `gate.${gate.category.key}`,
      label: gate.category.text,
    });
  }
  for (const question of input.severity) {
    if (question.answered) continue;
    gaps.push({ questionId: question.questionId, label: question.text });
  }
  // A question with a risk assessor is not answered, and pretending it is
  // would hide the one gap somebody is already working on.
  for (const handed of input.handedOff) gaps.push(handed);
  return gaps;
}

/**
 * The one rule for "open", everywhere it is asked (§4.3).
 *
 * Salvaged from the prior platform, whose `openPolicyFinding()` had exactly
 * this shape (G-59). A finding is open when nobody has settled it, OR when
 * the acceptance that settled it has expired — an expired acceptance
 * reopens automatically, which is what makes a time-boxed risk acceptance
 * mean anything. Packaging, the queue and the obligation count all ask this
 * one function, so they can never disagree.
 */
export function findingIsOpen(
  disposition: { kind: string; expiresAt: Date | null } | null,
  now: Date,
): boolean {
  if (disposition === null) return true;
  if (disposition.kind !== "risk-accepted") return false;
  return disposition.expiresAt === null || disposition.expiresAt <= now;
}
