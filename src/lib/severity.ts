/**
 * Tier 2 — how severe, and what that requires (SPEC §3.1, FR-6/7/8, S4).
 *
 * Pure: no framework, no driver, no environment. Like the Tier-1 engine,
 * nothing it produces is stored — bands and the controls they accumulate
 * are recomputed from the answers every time, so changing an answer changes
 * the workplan with no migration and no stale row (NFR-3, G-40).
 *
 * The instrument is data: every question's wording, every rubric anchor and
 * every threshold comes from `severity.json`, which was taken verbatim from
 * the owner's own instrument.
 */
import severityDoc from "@/data/instrument/severity.json";
import { matches, type AnswerLookup, type Condition } from "./conditions";

export const BANDS = ["Low", "Medium", "High"] as const;
export type Band = (typeof BANDS)[number];

/** A control objective a severity answer requires, at or above a threshold. */
export type Requirement = { objective: string; atLeast: Band; why: string };

/**
 * A detail question that appears only once its parent is severe enough
 * (FR-8, "severity-fired"). Its options can require controls of their own,
 * which is the nested kind: a conditional inside a conditional's answer.
 */
export type SeverityDetail = {
  questionId: string;
  text: string;
  firesAt: Band[];
  options: string[];
  optionRequires: Record<string, string[]>;
};

export type SeverityQuestion = {
  id: string;
  questionId: string;
  /** The Tier-1 path that lights it, or null for the always-asked few. */
  path: string | null;
  category: string;
  name: string;
  text: string;
  bands: Record<Band, string>;
  requires: Requirement[];
  detail?: SeverityDetail;
  /**
   * A band the platform can work out rather than ask (FR-7). The mapping is
   * declared here, in data — never inferred — so the reason shown to the
   * person is the same fact the engine used.
   */
  derivedFrom?: {
    from: string;
    map: Record<string, Band>;
    because: string;
  };
};

function validate(doc: { questions: SeverityQuestion[]; slug: string; version: string }) {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const q of doc.questions ?? []) {
    if (ids.has(q.questionId)) problems.push(`duplicate question id ${q.questionId}`);
    ids.add(q.questionId);
    for (const band of BANDS) {
      // A rubric anchor is the answer option (FR-6). A band with no anchor
      // is a bare word, and two people will read a bare word differently.
      if (!q.bands?.[band]?.trim())
        problems.push(`${q.id}: band ${band} has no rubric anchor`);
    }
    for (const requirement of q.requires ?? []) {
      if (!BANDS.includes(requirement.atLeast))
        problems.push(`${q.id}: requirement ${requirement.objective} has no valid threshold`);
      if (!requirement.why?.trim())
        problems.push(`${q.id}: requirement ${requirement.objective} has no reason`);
    }
    if (q.detail) {
      if (!q.detail.firesAt?.length) problems.push(`${q.id}: detail never fires`);
      if (!q.detail.options?.length) problems.push(`${q.id}: detail asks nothing`);
    }
    for (const [value, band] of Object.entries(q.derivedFrom?.map ?? {})) {
      if (!BANDS.includes(band))
        problems.push(`${q.id}: derived mapping for "${value}" is not a band`);
    }
  }
  if (problems.length > 0)
    throw new Error(`Severity instrument is invalid:\n- ${problems.join("\n- ")}`);
  return doc;
}

export const SEVERITY = validate(
  severityDoc as unknown as { questions: SeverityQuestion[]; slug: string; version: string },
);
export const SEVERITY_QUESTIONS = SEVERITY.questions;

const RANK: Record<Band, number> = { Low: 1, Medium: 2, High: 3 };

/**
 * §19: "Given unknown severity, `severity_at_least(Medium)` returns false."
 *
 * Unknown fails closed in the direction that does not manufacture safety:
 * an unanswered severity requires nothing yet, so it can never silently
 * satisfy a threshold. It also never *suppresses* anything, because
 * nothing has been accumulated to suppress.
 */
export function severityAtLeast(band: Band | null | undefined, threshold: Band): boolean {
  if (!band) return false;
  return RANK[band] >= RANK[threshold];
}

/** Which severity questions are asked, given the Tier-1 paths that are lit. */
export function severityQuestionsFor(litPathIds: string[]): SeverityQuestion[] {
  const lit = new Set(litPathIds);
  return SEVERITY_QUESTIONS.filter((q) => q.path === null || lit.has(q.path));
}

/** A band worked out from a fact already given, with the sentence to show. */
export type DerivedBand = { band: Band; because: string };

export function deriveBand(
  question: SeverityQuestion,
  answers: AnswerLookup,
): DerivedBand | null {
  const rule = question.derivedFrom;
  if (!rule) return null;
  const value = answers[rule.from];
  if (value === undefined || value === null) return null;
  // A list takes the worst thing in it: the band has to cover everything
  // involved, not the first item that happened to be selected.
  const candidates = (Array.isArray(value) ? value : [value])
    .map((v) => rule.map[v])
    .filter((b): b is Band => Boolean(b));
  if (candidates.length === 0) return null;
  const band = candidates.reduce((worst, b) => (RANK[b] > RANK[worst] ? b : worst));
  const named = Array.isArray(value) ? value.join(", ") : String(value);
  return { band, because: rule.because.replace("{value}", named) };
}

/** Whether a question's detail is showing, given its band (FR-8). */
export function detailFires(question: SeverityQuestion, band: Band | null): boolean {
  if (!question.detail || !band) return false;
  return question.detail.firesAt.includes(band);
}

/** One control objective this assessment requires, and every reason why. */
export type AccumulatedControl = {
  objective: string;
  /** Every reason, not the first — §19 routing criterion. */
  because: string[];
};

/**
 * What the answers so far require (§19, "control accumulation").
 *
 * A Medium accumulates objectives at `Low` and `Medium`, never `High`. Each
 * objective carries every reason that pulled it in, because a reviewer
 * seeing one reason is reading an incomplete record — and because two
 * questions requiring the same control is a fact about the assessment, not
 * a duplicate to collapse.
 */
export function accumulateControls(
  questions: SeverityQuestion[],
  bands: Record<string, Band | undefined>,
  details: Record<string, string[] | undefined>,
): AccumulatedControl[] {
  const owed = new Map<string, string[]>();
  const add = (objective: string, why: string) => {
    const reasons = owed.get(objective) ?? [];
    if (!reasons.includes(why)) reasons.push(why);
    owed.set(objective, reasons);
  };
  for (const question of questions) {
    const band = bands[question.questionId];
    if (!band) continue; // unknown requires nothing (§19)
    for (const requirement of question.requires) {
      if (!severityAtLeast(band, requirement.atLeast)) continue;
      add(requirement.objective, `${question.name} is ${band} — ${requirement.why}`);
    }
    if (!detailFires(question, band)) continue;
    const chosen = details[question.detail!.questionId] ?? [];
    for (const option of chosen) {
      for (const objective of question.detail!.optionRequires[option] ?? []) {
        add(objective, `${question.detail!.text} — ${option}`);
      }
    }
  }
  return [...owed.entries()]
    .map(([objective, because]) => ({ objective, because }))
    .sort((a, b) => a.objective.localeCompare(b.objective));
}

/**
 * A condition, rendered as one English sentence (§19, FR-5 — carried from
 * S3 where it was correctly marked not met).
 *
 * Deterministic on purpose. This sentence is what an auditor reads to
 * understand why a question was asked; generating it with a model would
 * make provenance non-reproducible, and non-reproducible provenance is
 * worse than none.
 */
export function conditionSentence(
  condition: Condition,
  label: (field: string) => string = (f) => f,
): string {
  const subject = label(condition.field);
  if ("hasValue" in condition) return `${subject} has been answered`;
  const list = "equalsAny" in condition ? condition.equalsAny : condition.includesAny;
  const options = list.map((o) => `“${o}”`);
  const joined =
    options.length === 1
      ? options[0]!
      : `${options.slice(0, -1).join(", ")} or ${options[options.length - 1]}`;
  return "equalsAny" in condition
    ? `${subject} is ${joined}`
    : `${subject} includes ${joined}`;
}

/**
 * Conditions that can never both hold (§19 contradiction lint, structural
 * half only — the semantic half is registered as an agentic opportunity and
 * is deliberately not attempted here).
 */
export function contradictions(conditions: Condition[]): string[] {
  const found: string[] = [];
  for (let i = 0; i < conditions.length; i++) {
    for (let j = i + 1; j < conditions.length; j++) {
      const a = conditions[i]!;
      const b = conditions[j]!;
      if (a.field !== b.field) continue;
      if ("equalsAny" in a && "equalsAny" in b) {
        const overlap = a.equalsAny.filter((v) => b.equalsAny.includes(v));
        if (overlap.length === 0)
          found.push(
            `${a.field} cannot be ${a.equalsAny.join("/")} and ${b.equalsAny.join("/")} at once`,
          );
      }
    }
  }
  return found;
}

/** Does the whole condition set ever match anything? */
export function isSatisfiable(conditions: Condition[], example: AnswerLookup): boolean {
  return conditions.every((c) => matches(c, example));
}

/**
 * What is wrong with a submitted set of severity answers, if anything.
 * Pure, so the refusal is testable without a database (§26.1).
 */
export function severitySubmissionProblems(
  answers: Record<string, string | string[]>,
): string[] {
  const problems: string[] = [];
  const byQuestion = new Map(SEVERITY_QUESTIONS.map((q) => [q.questionId, q]));
  const byDetail = new Map(
    SEVERITY_QUESTIONS.filter((q) => q.detail).map((q) => [q.detail!.questionId, q]),
  );
  for (const [questionId, value] of Object.entries(answers)) {
    const question = byQuestion.get(questionId);
    if (question) {
      if (Array.isArray(value) || !BANDS.includes(value as Band))
        problems.push(`${questionId}: "${String(value)}" is not one of Low, Medium or High`);
      continue;
    }
    const parent = byDetail.get(questionId);
    if (!parent) {
      problems.push(`${questionId}: no such question in this instrument`);
      continue;
    }
    const known = new Set(parent.detail!.options);
    const unknown = (Array.isArray(value) ? value : [value]).filter((v) => !known.has(v));
    if (unknown.length > 0)
      problems.push(`${questionId}: unknown option${unknown.length > 1 ? "s" : ""} ${unknown.join(", ")}`);
  }
  return problems;
}
