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
import { childrenAsked } from "./tier3";
import type { AnswerLookup } from "./conditions";
import { ALL_FIELDS, type IntakeField } from "./intake";
import { labelOf, type ReferenceAnswer } from "./reference";

/** A question a person has not answered, in its own words. */
export type Gap = { questionId: string; label: string };

/** One line of what the submitter declared accurate. */
export type Declared = { questionId: string; label: string; value: string };

/** What submission turns a Tier-3 answer into (§4.3). */
export type FindingKind = "gap" | "enhancement";

export type SynthesisedFinding = {
  questionId: string;
  objective: string;
  objectiveName: string;
  kind: FindingKind;
  note: string;
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
      found.push({
        questionId,
        objective: objective.id,
        objectiveName: objective.name,
        kind,
        note: value.note.trim(),
      });
    };
    consider(objective.questionId, parent);
    for (const child of childrenAsked(objective, parent?.answer ?? null, answers)) {
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
): Gap[] {
  const gaps: Gap[] = [];
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
export function declarationMatches(shown: Declared[], current: Declared[]): boolean {
  if (shown.length !== current.length) return false;
  const byId = new Map(current.map((d) => [d.questionId, d.value]));
  return shown.every((d) => byId.get(d.questionId) === d.value);
}
