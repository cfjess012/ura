/**
 * Where one assessment has got to, said in the requester's terms.
 *
 * The four steps are the SPEC §4.1 process — the same four the project
 * header shows, from the same list, so a row and a header can never call the
 * same assessment two different things (§24.6).
 *
 * Everything is DERIVED from the record: the intake row, the answers in
 * force, and — once submitted — the review counts. Nothing is stored as a
 * "stage" column, so nothing can go stale against the answers it describes
 * (NFR-3).
 *
 * Pure: no framework, no driver, no environment (§26.1).
 */
import { CATEGORIES, gateStates, unansweredCount } from "./instrument";
import { litPaths } from "./engine";
import { sectionProgress, type IntakeValues } from "./intake";
import {
  accumulateControls,
  severityQuestionsFor,
  type Band,
} from "./severity";
import { childrenAsked, isTier3Value, objectivesFor } from "./tier3";
import type { AnswerLookup } from "./conditions";
import type { ReviewCounts } from "./review-standing";

/** The four steps, in order, exactly as the header names them (§4.1). */
export const STEPS = [
  "Tell us about it",
  "Assess",
  "Review & attest",
  "Package",
] as const;

export type Step = 1 | 2 | 3 | 4;

/**
 * Whose move it is.
 *
 * This is the fact a requester opens the list to find, and the one their
 * list has never carried: a draft is theirs, a submitted assessment is not,
 * and an attested one is nobody's. It is what the list groups on.
 */
export type Turn = "you" | "reviewer" | "settled";

export type OwnStanding = {
  step: Step;
  /** The step's name — never a screen name, never an internal key (§24.7). */
  stepLabel: string;
  turn: Turn;
  /** What is outstanding, named where it can be named rather than counted. */
  says: string;
  /**
   * How far through this step, and only where the denominator is honest.
   *
   * Deliberately absent on the risk areas. Answering a gate Yes OPENS
   * questions, so a meter there falls as a person works and would be a
   * claim the numbers do not support (§24.9). Words carry that step.
   */
  meter: { done: number; total: number; label: string } | null;
};

/** A stored answer, as thin as this module needs it. */
type Stored = Record<
  string,
  { value: unknown; source: string; confirmed: boolean }
>;

/** Step 1: the identity record, which is countable and stays countable. */
function intakeStanding(intake: IntakeValues): OwnStanding | null {
  const sections = sectionProgress(intake);
  const outstanding = sections.reduce((n, s) => n + s.missing.length, 0);
  if (outstanding === 0) return null;
  const next = sections.find((s) => s.missing.length > 0)!;
  return {
    step: 1,
    stepLabel: STEPS[0],
    turn: "you",
    says:
      outstanding === next.missing.length
        ? `${outstanding} answer${outstanding === 1 ? "" : "s"} needed in ${next.name}`
        : `${outstanding} answers needed — ${next.missing.length} of them in ${next.name}`,
    meter: {
      done: sections.reduce((n, s) => n + s.answered, 0),
      total: sections.reduce((n, s) => n + s.visible, 0),
      label: "answered",
    },
  };
}

/**
 * Step 2: the risk areas, named in the order the person meets them.
 *
 * The FIRST thing outstanding, not a total. A single number over four
 * different kinds of question ("14 left") is the count FR-14 objected to:
 * nobody can act on it, and it hides which screen to open.
 */
function assessStanding(intake: IntakeValues, stored: Stored): OwnStanding {
  const gates = gateStates(stored, intake);
  const openGates = unansweredCount(gates);

  const selections: Record<string, string[]> = {};
  for (const category of CATEGORIES) {
    const value = category.pathQuestion
      ? stored[category.pathQuestion.questionId]?.value
      : undefined;
    if (Array.isArray(value)) selections[category.key] = value as string[];
  }
  const unnarrowed = gates.filter(
    (g) =>
      g.answer === "Yes" &&
      g.category.pathQuestion &&
      selections[g.category.key] === undefined,
  ).length;

  const lit = litPaths(CATEGORIES, gates, selections, intake);
  const severity = severityQuestionsFor(lit.map((p) => p.id));
  const bands: Record<string, Band | undefined> = {};
  const details: Record<string, string[] | undefined> = {};
  for (const question of severity) {
    const value = stored[question.questionId]?.value;
    if (typeof value === "string") bands[question.questionId] = value as Band;
    if (question.detail) {
      const detail = stored[question.detail.questionId]?.value;
      if (Array.isArray(detail))
        details[question.detail.questionId] = detail as string[];
    }
  }
  const openSeverity = severity.filter((q) => !bands[q.questionId]).length;

  // Controls are only owed once the severities that accumulate them are
  // answered, so this count grows as the work is done — which is why it is
  // reported as "still to answer" and never as a fraction.
  const owed = accumulateControls(severity, bands, details);
  const objectives = objectivesFor(owed.map((c) => c.objective));
  const lookup: AnswerLookup = {};
  for (const [questionId, answer] of Object.entries(stored)) {
    if (typeof answer.value === "string" || Array.isArray(answer.value))
      lookup[questionId] = answer.value as string | string[];
  }
  let openControls = 0;
  for (const objective of objectives) {
    const value = stored[objective.questionId]?.value;
    const given = isTier3Value(value) ? value : null;
    if (!given) {
      openControls += 1;
      continue;
    }
    for (const child of childrenAsked(objective, given.answer, lookup))
      if (!isTier3Value(stored[child.questionId]?.value)) openControls += 1;
  }

  const said =
    openGates > 0
      ? `${openGates} risk area${openGates === 1 ? "" : "s"} still to answer`
      : unnarrowed > 0
        ? `${unnarrowed} risk area${unnarrowed === 1 ? " needs" : "s need"} narrowing down`
        : openSeverity > 0
          ? `${openSeverity} detail question${openSeverity === 1 ? "" : "s"} still to answer`
          : openControls > 0
            ? `${openControls} control question${openControls === 1 ? "" : "s"} still to answer`
            : "Everything is answered — it is ready to submit";
  return { step: 2, stepLabel: STEPS[1], turn: "you", says: said, meter: null };
}

/** Steps 3 and 4: what the record is waiting for once it has been sent. */
function reviewStandingFor(counts: ReviewCounts): OwnStanding {
  const answered = counts.answeredIds.length;
  const signed = counts.attestedIds.filter((id) =>
    counts.answeredIds.includes(id),
  ).length;
  const open =
    counts.openViolations.length +
    counts.openGaps.length +
    counts.openEnhancements.length;

  if (signed < answered)
    return {
      step: 3,
      stepLabel: STEPS[2],
      turn: "reviewer",
      says: `${signed} of ${answered} answer${answered === 1 ? "" : "s"} signed by a Risk Assessor`,
      meter: { done: signed, total: answered, label: "signed" },
    };
  if (open > 0)
    return {
      step: 3,
      stepLabel: STEPS[2],
      turn: "reviewer",
      says: `Every answer is signed. ${open} finding${open === 1 ? "" : "s"} still to settle`,
      meter: null,
    };
  return {
    step: 4,
    stepLabel: STEPS[3],
    turn: "settled",
    says: "Signed and settled — ready to package",
    meter: null,
  };
}

/**
 * Where this assessment stands, for the person who owns it.
 *
 * `counts` is null exactly while it is a draft: there is nothing to review
 * until it has been submitted, and passing zeroed counts would make an
 * untouched draft read as fully signed.
 */
export function ownStanding(input: {
  submittedAt: Date | null;
  intake: IntakeValues;
  answers: Stored;
  counts: ReviewCounts | null;
}): OwnStanding {
  if (input.submittedAt === null)
    return (
      intakeStanding(input.intake) ??
      assessStanding(input.intake, input.answers)
    );
  // Submitted with nothing recorded against it yet: still the reviewer's,
  // and saying "0 of 0 signed" would read as finished rather than as new.
  if (!input.counts || input.counts.answeredIds.length === 0)
    return {
      step: 3,
      stepLabel: STEPS[2],
      turn: "reviewer",
      says: "With a Risk Assessor — nothing is signed yet",
      meter: null,
    };
  return reviewStandingFor(input.counts);
}
