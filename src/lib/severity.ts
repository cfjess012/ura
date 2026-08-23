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
import {
  BANDS,
  matches,
  type AnswerLookup,
  type Band,
  type Condition,
} from "./conditions";
import { ALL_PATHS, SEVERITY_OF, assessmentLookup } from "./engine";
import { CATEGORIES, type GateState } from "./instrument";
import { ALL_FIELDS } from "./intake";

const INTAKE_FIELD_IDS = new Set(ALL_FIELDS.map((f) => f.id));

// The bands and their order belong to the engine that compares them (§6.3);
// re-exported here because this is where the instrument speaks of them.
export { BANDS, type Band };

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

export type SeverityDoc = {
  questions: SeverityQuestion[];
  slug: string;
  version: string;
  /** The owner's control catalogue, keyed by their code. */
  controls: Record<string, { name: string; family: string; objective?: string }>;
};

/** Exported so its reference checks are reachable from the suite. */
export function validate(doc: SeverityDoc) {
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
  // A reference that does not resolve is a silent no-op: a question whose
  // `path` names nothing is simply never asked, and a `derivedFrom.from`
  // naming nothing returns null forever. Both look correct in the data and
  // do nothing. The reference is external — the Tier-1 instrument's own
  // path options and intake field ids — so only this check can catch it.
  const pathIds = new Set(
    CATEGORIES.flatMap((c) => [
      ...(c.pathQuestion?.options ?? []).map((o) => o.id),
      ...(c.derivedPaths ?? []).map((d) => d.id),
    ]),
  );
  for (const q of doc.questions ?? []) {
    if (q.path !== null && !pathIds.has(q.path))
      problems.push(`${q.id}: lit by path "${q.path}", which no risk area offers — it can never be asked`);
    const from = q.derivedFrom?.from;
    if (from && !INTAKE_FIELD_IDS.has(from))
      problems.push(`${q.id}: derived from "${from}", which is not an intake field — it can never fire`);
  }

  // Every control objective a question can pull in must have a human name
  // in the catalogue, or the screen falls back to the code — which NFR-9
  // forbids. The check is here rather than in a test so a control added
  // without a name cannot boot, let alone reach a person.
  const named = new Set(Object.keys(doc.controls ?? {}));
  const cited = new Set<string>();
  for (const q of doc.questions ?? []) {
    for (const requirement of q.requires ?? []) cited.add(requirement.objective);
    for (const objectives of Object.values(q.detail?.optionRequires ?? {}))
      for (const objective of objectives) cited.add(objective);
  }
  for (const code of cited)
    if (!doc.controls?.[code]?.name?.trim())
      problems.push(`control ${code} has no name — it would show as its code`);
  // And a catalogue that grows entries nothing cites is dead weight that
  // rots: the names are the owner's, but the set of them is ours to keep
  // honest.
  for (const code of named)
    if (!cited.has(code)) problems.push(`control ${code} is in the catalogue but nothing requires it`);
  if (problems.length > 0)
    throw new Error(`Severity instrument is invalid:\n- ${problems.join("\n- ")}`);
  return doc;
}

export const SEVERITY = validate(severityDoc as unknown as SeverityDoc);
export const SEVERITY_QUESTIONS = SEVERITY.questions;

/**
 * Tier-2 routing, as conditions over the one engine (§3.3: "accumulation is
 * expressed as activation conditions over the same engine — there is no
 * second evaluator").
 *
 * The instrument authors its routing in the owner's vocabulary — a path
 * name, a list of bands, a threshold. These three functions are the only
 * place that turns that vocabulary into conditions; `matches()` does every
 * evaluation, and unknown fails closed there rather than here (§19).
 */
export function askedWhen(question: SeverityQuestion): Condition | null {
  // The always-asked few carry no condition at all.
  return question.path === null
    ? null
    : { field: ALL_PATHS, includesAny: [question.path] };
}

/** The bands at which a question's detail is on screen (FR-8). */
export function detailWhen(question: SeverityQuestion): Condition | null {
  return question.detail
    ? { field: SEVERITY_OF(question.questionId), equalsAny: question.detail.firesAt }
    : null;
}

/** The band at or above which a requirement is owed (§6.3 severity-at-least). */
export function requiredWhen(
  question: SeverityQuestion,
  requirement: Requirement,
): Condition {
  return {
    field: SEVERITY_OF(question.questionId),
    severityAtLeast: requirement.atLeast,
  };
}

/** Which severity questions are asked, given the Tier-1 paths that are lit. */
export function severityQuestionsFor(litPathIds: string[]): SeverityQuestion[] {
  // The one key these rules read, under the name the engine gives it.
  const answers: AnswerLookup = { [ALL_PATHS]: litPathIds };
  return SEVERITY_QUESTIONS.filter((q) => {
    const when = askedWhen(q);
    return when === null || matches(when, answers);
  });
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
  const band = candidates.reduce((worst, b) =>
    BANDS.indexOf(b) > BANDS.indexOf(worst) ? b : worst,
  );
  const named = Array.isArray(value) ? value.join(", ") : String(value);
  return { band, because: rule.because.replace("{value}", named) };
}

/** Whether a question's detail is showing, given the answers so far (FR-8). */
export function detailFires(question: SeverityQuestion, answers: AnswerLookup): boolean {
  const when = detailWhen(question);
  return when !== null && matches(when, answers);
}

/**
 * The catalogue entry for a control objective — the owner's own, taken
 * from their instrument, keyed by their code.
 *
 * NFR-9 forbids an internal identifier in user-facing text: "T3-RES-01"
 * tells a business owner nothing about what is being asked of them;
 * "Backup & Recovery" tells them most of it.
 */
export type ControlObjective = {
  name: string;
  family: string;
  /** The full objective sentence, where the owner's catalogue carries one. */
  objective?: string;
};

export const CONTROLS: Record<string, ControlObjective> = SEVERITY.controls;

/**
 * What to call a control objective on screen. Never the code.
 *
 * A code with no catalogue entry is a defect the validator refuses at
 * boot, so this cannot silently fall back to showing one.
 */
export function controlName(code: string): string {
  return CONTROLS[code]?.name ?? code;
}

/** One control objective this assessment requires, and every reason why. */
export type AccumulatedControl = {
  /** The owner's code — for the record and the destination, not the screen. */
  objective: string;
  /** What a person reads (NFR-9). */
  name: string;
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
  const answers = assessmentLookup({ severities: bands });
  const owed = new Map<string, string[]>();
  const add = (objective: string, why: string) => {
    const reasons = owed.get(objective) ?? [];
    if (!reasons.includes(why)) reasons.push(why);
    owed.set(objective, reasons);
  };
  for (const question of questions) {
    const band = bands[question.questionId];
    if (!band) continue; // so the reason below can name the band
    for (const requirement of question.requires) {
      if (!matches(requiredWhen(question, requirement), answers)) continue;
      add(requirement.objective, `${question.name} is ${band} — ${requirement.why}`);
    }
    if (!detailFires(question, answers)) continue;
    const chosen = details[question.detail!.questionId] ?? [];
    for (const option of chosen) {
      for (const objective of question.detail!.optionRequires[option] ?? []) {
        add(objective, `${question.detail!.text} — ${option}`);
      }
    }
  }
  return [...owed.entries()]
    .map(([objective, because]) => ({ objective, name: controlName(objective), because }))
    // Sorted by what a person reads, not by the internal code.
    .sort((a, b) => a.name.localeCompare(b.name));
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

/**
 * What a severity screen may actually write, given what is on it.
 *
 * Two rules. A band is written only when the person answered it. A
 * **detail question is written only when it is on screen** — its parent
 * band answered, and answered at or above the threshold that reveals it.
 *
 * The second rule matters because an empty list is not "no answer" in this
 * instrument: it is the substantive answer *none of these apply*,
 * insert-only, attributed and confirmed. Writing one for a question nobody
 * was shown records a claim on their behalf, permanently (G-42).
 *
 * It lives here rather than in the form so it is provable without a
 * browser (§26.1).
 */
export function writableSeverityAnswers(
  questions: SeverityQuestion[],
  bands: Record<string, Band | null | undefined>,
  details: Record<string, string[]>,
  touched: string[],
  /**
   * What is already recorded. An answer identical to the one on file is not
   * an event, and insert-only would make it permanent: a history padded
   * with non-events is a history nobody reads. `intakeChanges()` applies
   * the same rule one tier up.
   */
  persisted: Record<string, string | string[] | undefined> = {},
): Record<string, string | string[]> {
  const answers = assessmentLookup({ severities: bands });
  const covered = new Set(touched);
  const payload: Record<string, string | string[]> = {};
  const unchanged = (id: string, value: string | string[]) => {
    const before = persisted[id];
    if (before === undefined) return false;
    if (Array.isArray(value) || Array.isArray(before)) {
      const a = Array.isArray(before) ? before : [before];
      const b = Array.isArray(value) ? value : [value];
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    return before === value;
  };
  for (const question of questions) {
    const band = bands[question.questionId] ?? null;
    if (covered.has(question.questionId) && band && !unchanged(question.questionId, band))
      payload[question.questionId] = band;
    if (
      question.detail &&
      covered.has(question.detail.questionId) &&
      detailFires(question, answers)
    ) {
      const chosen = details[question.detail.questionId] ?? [];
      if (!unchanged(question.detail.questionId, chosen))
        payload[question.detail.questionId] = chosen;
    }
  }
  return payload;
}

/**
 * Risk areas that ask nothing beyond their gate (FR-35, G-50).
 *
 * Tier-2 depth is pilot-scoped to four areas. The other seven have a gate
 * and nothing behind it: answering Yes records that the area is in scope
 * for a reviewer, and that is the whole of it. The scope is deliberate;
 * what was wrong is that the product presented an empty area and a deep
 * one identically — both read "Applies", so a person could not tell
 * "nothing more to ask" from "not built yet".
 *
 * Derived, never listed. A hand-written list of seven keys would be a
 * second source of truth that goes stale the moment a path is added — and
 * the area would go quiet again with nobody noticing.
 */
export function asksNothingFurther(categoryKey: string): boolean {
  const category = CATEGORIES.find((c) => c.key === categoryKey);
  if (!category) return false;
  const paths = [
    ...(category.pathQuestion?.options ?? []).map((option) => option.id),
    ...(category.derivedPaths ?? []).map((path) => path.id),
  ];
  if (paths.length === 0) return true;
  return severityQuestionsFor(paths).length === 0;
}

/** The sentence a person reads where an area stops. One wording, everywhere. */
export const STOPS_HERE =
  "This area applies, and that is recorded for a reviewer. The pilot asks its detailed questions in four areas — third party, AI, data and security — so there is nothing further to answer here.";

/** The short form, for the rail where a full sentence will not fit. */
export const STOPS_HERE_SHORT = "Applies · recorded for review";

/**
 * How a risk area's state reads in the rail — one rule, one place.
 *
 * This lived as a five-level nested ternary inside the component, and the
 * boundary note was added to only one of its branches: an area whose Yes
 * came from intake read "Yes · from intake" with no declaration at all, on
 * a surface FR-35 names explicitly (verifier F11). Nesting hid the missing
 * case. Written out, every branch has to answer the question.
 *
 * It lives here rather than with the gate instrument because deciding
 * whether an area asks anything further needs the severity set, and
 * `instrument.ts` cannot import this module without a cycle.
 */
export function gateStateLabel(state: GateState): string {
  const quiet = asksNothingFurther(state.category.key);
  // Applies to everyone and nobody is asked (G-36) — its own thing, and it
  // already explains itself; adding the boundary note would say it twice.
  if (state.settled) return "Applies · not asked";
  if (state.answer === "No") return "Not applicable";
  if (state.answer !== "Yes") return "";
  if (state.fromIntake) {
    const source = state.origin === "answers" ? "from your answers" : "from intake";
    // Both facts, because both are true: where the answer came from, and
    // that nothing further is asked here.
    return quiet ? `Yes · ${source} · recorded for review` : `Yes · ${source}`;
  }
  return quiet ? STOPS_HERE_SHORT : "Applies";
}
