/**
 * Tier 3 — does the control actually exist? (SPEC §3.4, FR-12, FR-13)
 *
 * Tiers 1 and 2 work out what this activity requires. This tier is the only
 * one that asks whether the requirement is met, and its answers are what
 * findings are synthesised from at submit (§4.3).
 *
 * Content is versioned seed data transcribed verbatim from the owner's
 * reference instrument (G-27); nothing here authors a question. Pure: no
 * framework, no driver, no environment (§26.1).
 */
import doc from "@/data/instrument/tier3.json";
import { matches, type AnswerLookup, type Condition } from "./conditions";
import { controlName } from "./severity";

/** The four answers, worst-consequence order preserved from §3.4. */
export const TIER3_ANSWERS = ["Yes", "Partial", "No", "N-A"] as const;
export type Tier3Answer = (typeof TIER3_ANSWERS)[number];

export type Tier3Child = {
  id: string;
  questionId: string;
  text: string;
  /** Cross-tier conditions; all must hold for the child to be asked. */
  when?: Condition[];
};

export type Tier3Objective = {
  id: string;
  questionId: string;
  name: string;
  family: string;
  area: string;
  text: string;
  objective: string;
  children: Tier3Child[];
};

type Tier3Doc = {
  slug: string;
  version: string;
  note: string;
  answers: string[];
  objectives: Tier3Objective[];
};

/**
 * Validate on import, the way the other two instruments do: a malformed
 * file must fail the build, not the screen.
 */
function validate(candidate: Tier3Doc): Tier3Doc {
  const seen = new Set<string>();
  const fail = (why: string): never => {
    throw new Error(`tier3.json: ${why}`);
  };
  if (candidate.objectives.length === 0) fail("has no objectives");
  const declared = new Set(candidate.answers);
  for (const answer of TIER3_ANSWERS) {
    if (!declared.has(answer))
      fail(`does not declare the "${answer}" answer (§3.4)`);
  }
  for (const objective of candidate.objectives) {
    for (const id of [
      objective.questionId,
      ...objective.children.map((c) => c.questionId),
    ]) {
      if (seen.has(id)) fail(`question id "${id}" appears twice`);
      seen.add(id);
      if (!id.startsWith("t3."))
        fail(`question id "${id}" is not namespaced t3.`);
    }
    if (!objective.text.trim()) fail(`${objective.id} has no question text`);
    // A control nobody can be asked about is content that never reaches a
    // person — the reachability rule, one tier down (audit C-10).
    if (!controlName(objective.id))
      fail(`${objective.id} is not in the control catalogue`);
  }
  return candidate;
}

export const TIER3: Tier3Doc = validate(doc as Tier3Doc);
export const TIER3_VERSION = TIER3.version;
export const OBJECTIVES: Tier3Objective[] = TIER3.objectives;

/** The objectives this instrument can actually ask about, by control id. */
const BY_ID = new Map(OBJECTIVES.map((o) => [o.id, o]));

/**
 * The Tier-3 questions owed for a set of accumulated control objectives.
 *
 * Accumulation (§3.3) decides WHICH controls this activity requires; this
 * decides which of those the pilot has questions for. The rest are recorded
 * for a reviewer and say so on screen — the same declared boundary the risk
 * areas draw (G-50), one tier down.
 */
export function objectivesFor(accumulated: string[]): Tier3Objective[] {
  return accumulated
    .map((id) => BY_ID.get(id))
    .filter((o): o is Tier3Objective => o !== undefined);
}

/** Accumulated controls the pilot asks nothing about. */
export function withoutQuestions(accumulated: string[]): string[] {
  return accumulated.filter((id) => !BY_ID.has(id));
}

/**
 * Children are asked only when the parent is Yes (FR-13), and only when
 * their own cross-tier conditions hold. A suppressed child is invisible,
 * never "skipped" (§3.4) — the caller renders nothing, not a placeholder.
 */
export function childrenAsked(
  objective: Tier3Objective,
  parentAnswer: Tier3Answer | null,
  answers: AnswerLookup,
): Tier3Child[] {
  if (parentAnswer !== "Yes") return [];
  return objective.children.filter((child) =>
    (child.when ?? []).every((condition) => matches(condition, answers)),
  );
}

/**
 * Whether an answer must carry a written note (§3.4).
 *
 * Yes is the only answer that stands on its own. Partial and No each become
 * a finding at submit and the note is what a reviewer reads; N-A is a claim
 * that the control does not apply, which is exactly the claim that needs
 * justifying — and it is exported as "N-A — reason", never blank (FR-20).
 */
export function noteRequired(answer: Tier3Answer): boolean {
  return answer !== "Yes";
}

/** What a person is told they still owe. Empty means the answer is complete. */
export function noteProblem(
  answer: Tier3Answer | null,
  note: string,
): string | null {
  if (answer === null) return null;
  if (!noteRequired(answer)) return null;
  if (note.trim().length > 0) return null;
  return answer === "N-A"
    ? "Say why this doesn't apply — a reviewer reads this instead of the answer."
    : "Say what exists today and what is missing — this travels to the reviewer.";
}

/** The stored shape of a Tier-3 answer: the answer and its note together. */
export type Tier3Value = { answer: Tier3Answer; note: string };

export function isTier3Value(value: unknown): value is Tier3Value {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.answer === "string" &&
    (TIER3_ANSWERS as readonly string[]).includes(candidate.answer) &&
    typeof candidate.note === "string"
  );
}

/**
 * Exactly which Tier-3 questions may be answered right now.
 *
 * The set the SCREEN shows, computed from the same rules, so the action can
 * refuse anything else. Two defects made this necessary (verifier S6-1,
 * S6-2): the submission check iterated objectives and silently ignored keys
 * it did not recognise, so a forged request wrote arbitrary question ids;
 * and it validated a child only when `childrenAsked` returned it, so a
 * child submitted under a non-Yes parent skipped the note rule entirely and
 * an N-A landed with no justification — falsifying this slice's own
 * done-when.
 *
 * Parents come from what the assessment requires. A child is answerable
 * only if its parent's answer IN THIS SUBMISSION is Yes and its own
 * cross-tier conditions hold — the same rule the form renders.
 */
export function answerableQuestionIds(
  required: Tier3Objective[],
  submitted: Record<string, Tier3Value>,
  answers: AnswerLookup,
): Set<string> {
  const allowed = new Set<string>();
  for (const objective of required) {
    allowed.add(objective.questionId);
    const parent = submitted[objective.questionId]?.answer ?? null;
    for (const child of childrenAsked(objective, parent, answers)) {
      allowed.add(child.questionId);
    }
  }
  return allowed;
}

/**
 * What is wrong with a submission, checked against what may actually be
 * answered. Replaces the objective-walking version, which could not see a
 * key it did not expect.
 */
export function submissionProblems(
  required: Tier3Objective[],
  submitted: Record<string, Tier3Value>,
  answers: AnswerLookup,
): string[] {
  const allowed = answerableQuestionIds(required, submitted, answers);
  const labels = new Map<string, string>();
  for (const objective of required) {
    labels.set(objective.questionId, objective.name);
    for (const child of objective.children) {
      labels.set(child.questionId, `${objective.name} — ${child.text}`);
    }
  }

  const problems: string[] = [];
  for (const [questionId, value] of Object.entries(submitted)) {
    if (!allowed.has(questionId)) {
      // Not a question this assessment is asking. Refused rather than
      // ignored: ignoring it is what let it be written.
      problems.push(
        `"${labels.get(questionId) ?? questionId}" isn't a question this assessment is asking.`,
      );
      continue;
    }
    const problem = noteProblem(value.answer, value.note);
    if (problem)
      problems.push(`${labels.get(questionId) ?? questionId}: ${problem}`);
  }
  return problems;
}

/**
 * The control objective a Tier-3 question belongs to — parent or child.
 *
 * This exists because authority must never be decided from a value the
 * client supplied (verifier finding 1). The question being signed is the
 * fact; which risk area owns it is derived from that, here, on the server.
 */
export function objectiveForQuestion(
  questionId: string,
): Tier3Objective | null {
  for (const objective of OBJECTIVES) {
    if (objective.questionId === questionId) return objective;
    if (objective.children.some((child) => child.questionId === questionId))
      return objective;
  }
  return null;
}
