/**
 * The Tier-1 instrument: eleven categories, one gate each (FR-3).
 *
 * Content is versioned seed data (NFR-8) imported at build time — never read
 * from disk at request time, so this works unchanged in a Lambda or a
 * container (§26.1). The loader validates on import: a malformed instrument
 * fails immediately and loudly rather than rendering a broken screen.
 */
import gates from "@/data/instrument/gates.json";
import { matches, type AnswerLookup, type Condition } from "./conditions";
import { ALL_FIELDS } from "./intake";

/** Intake field ids a rule may legitimately read. */
const INTAKE_FIELD_IDS = new Set(ALL_FIELDS.map((f) => f.id));

export type GatePrefill = {
  answer: "Yes" | "No";
  when: Condition;
  /** Plain-language reason shown to the person (FR-22, §24.4). */
  because: string;
};

/** One selectable thread inside a category (Tier-1 paths, SPEC §3.2). */
export type PathOption = { id: string; label: string; help?: string };

/** The multi-select that tailors a category once its gate says Yes. */
export type PathQuestion = {
  questionId: string;
  text: string;
  help: string;
  options: PathOption[];
};

/**
 * A path the engine lights from evidence already given, rather than asking.
 * `when` is a list because these are conjunctions — "personal information
 * IS involved AND this uses AI" — and every one carries the sentence shown
 * to the person, because a path that appears without a reason is the kind
 * of magic people stop trusting (§24.5).
 */
export type DerivedPath = {
  id: string;
  name: string;
  when: Condition[];
  because: string;
};

export type Category = {
  key: string;
  name: string;
  short: string;
  questionId: string;
  text: string;
  help: string;
  prefill: GatePrefill[];
  /**
   * True where the area applies to every assessment, so asking is ceremony
   * (G-36). The category is not removed and its risk coverage does not
   * change — the *question* is. A gate answered the same way by everyone
   * sorts nobody, and a question with a foregone answer spends a person's
   * attention for nothing.
   */
  alwaysApplies?: boolean;
  /** Why it always applies, in the words shown to the person. */
  because?: string;
  pathQuestion?: PathQuestion;
  derivedPaths?: DerivedPath[];
};

export type Instrument = {
  slug: string;
  version: string;
  categories: Category[];
};

/**
 * Exported so its rules can be tested. Its four reference checks — unknown
 * gate, `paths` read before paths resolve, unknown category, unknown
 * intake field — are pinned by nothing else; module-private, an edit could
 * delete them with every gate staying green.
 */
export function validate(candidate: Instrument): Instrument {
  const problems: string[] = [];
  if (!candidate.slug || !candidate.version)
    problems.push("missing slug or version");
  const seenKeys = new Set<string>();
  const seenQuestions = new Set<string>();
  for (const category of candidate.categories ?? []) {
    const where = category.key || "(unnamed)";
    if (seenKeys.has(category.key))
      problems.push(`duplicate category key ${category.key}`);
    if (seenQuestions.has(category.questionId))
      problems.push(`duplicate question id ${category.questionId}`);
    seenKeys.add(category.key);
    seenQuestions.add(category.questionId);
    for (const field of [
      "name",
      "short",
      "questionId",
      "text",
      "help",
    ] as const) {
      if (!category[field]?.trim()) problems.push(`${where}: missing ${field}`);
    }
    if (category.alwaysApplies && !category.because?.trim())
      problems.push(`${where}: alwaysApplies needs a plain-language reason`);
    if (category.alwaysApplies && (category.prefill ?? []).length > 0)
      problems.push(`${where}: alwaysApplies cannot also carry prefill rules`);
    const pathIds = new Set<string>();
    for (const option of category.pathQuestion?.options ?? []) {
      if (!option.id?.trim() || !option.label?.trim())
        problems.push(`${where}: path option needs an id and a label`);
      if (pathIds.has(option.id))
        problems.push(`${where}: duplicate path option ${option.id}`);
      pathIds.add(option.id);
    }
    if (category.pathQuestion && !category.pathQuestion.text?.trim())
      problems.push(`${where}: path question needs text`);
    for (const derived of category.derivedPaths ?? []) {
      if (!derived.because?.trim())
        problems.push(`${where}: derived path ${derived.id} needs a plain-language reason`);
      if (!derived.when?.length)
        problems.push(`${where}: derived path ${derived.id} needs at least one condition`);
    }
    for (const rule of category.prefill ?? []) {
      if (rule.when?.field === `gate.${category.key}`)
        problems.push(`${where}: a gate cannot pre-fill from its own answer`);
      if (rule.answer !== "Yes" && rule.answer !== "No")
        problems.push(`${where}: prefill answer must be Yes or No`);
      if (!rule.because?.trim())
        problems.push(`${where}: prefill needs a plain-language reason`);
    }
  }
  // Derivations may read what a person CHOSE, never what another rule
  // derived. Checked across the whole instrument rather than per category,
  // because a rule can reference any category's paths. A chained rule
  // validates as well-formed and then never fires — and a rule that looks
  // correct and does nothing is worse than one that is rejected.
  const derivedIds = new Set(
    (candidate.categories ?? []).flatMap((c) => (c.derivedPaths ?? []).map((d) => d.id)),
  );
  for (const category of candidate.categories ?? []) {
    for (const derived of category.derivedPaths ?? []) {
      for (const condition of derived.when ?? []) {
        if (!("includesAny" in condition)) continue;
        if (condition.field !== "paths" && !condition.field.startsWith("path.")) continue;
        const optionIds = new Set(
          (candidate.categories ?? []).flatMap((c) =>
            (c.pathQuestion?.options ?? []).map((o) => o.id),
          ),
        );
        const chained = condition.includesAny.filter(
          (id) => derivedIds.has(id) && !optionIds.has(id),
        );
        if (chained.length > 0)
          problems.push(
            `${category.key}: derived path ${derived.id} depends on ${chained.join(", ")}, which is itself derived — derivations may not chain`,
          );
      }
    }
  }

  // Every condition must name something that exists, and something the
  // surface evaluating it can actually see. A rule referring to a gate key
  // with a typo, or to `paths` from a gate pre-fill (which is resolved
  // before any path is chosen), validates as well-formed and then never
  // fires — the silent no-op, in its general form.
  const categoryKeys = new Set((candidate.categories ?? []).map((c) => c.key));
  const knownField = (field: string, where: string, canSeePaths: boolean) => {
    if (field === "paths" || field.startsWith("path.")) {
      if (!canSeePaths)
        return `${where}: reads "${field}", which is not resolved yet when gates are settled — it can never fire`;
      const key = field.slice("path.".length);
      if (field !== "paths" && !categoryKeys.has(key))
        return `${where}: reads paths of unknown category "${key}"`;
      return null;
    }
    if (field.startsWith("gate.")) {
      const key = field.slice("gate.".length);
      return categoryKeys.has(key) ? null : `${where}: reads unknown gate "${key}"`;
    }
    return INTAKE_FIELD_IDS.has(field)
      ? null
      : `${where}: reads "${field}", which is not an intake field, a gate, or a path`;
  };
  for (const category of candidate.categories ?? []) {
    for (const rule of category.prefill ?? []) {
      const problem = knownField(rule.when?.field ?? "", `${category.key} prefill`, false);
      if (problem) problems.push(problem);
    }
    for (const derived of category.derivedPaths ?? []) {
      for (const condition of derived.when ?? []) {
        const problem = knownField(
          condition.field ?? "",
          `${category.key} derived path ${derived.id}`,
          true,
        );
        if (problem) problems.push(problem);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Instrument is invalid:\n- ${problems.join("\n- ")}`);
  }
  return candidate;
}

export const INSTRUMENT: Instrument = validate(gates as Instrument);
export const CATEGORIES = INSTRUMENT.categories;

export function categoryByKey(key: string): Category | undefined {
  return CATEGORIES.find((c) => c.key === key);
}

/** Where a gate answer came from, when nobody has answered it here yet. */
export type Prefilled = { answer: "Yes" | "No"; because: string };

/**
 * FR-22: an intake answer that duplicates a gate pre-answers it. The result
 * carries its reason so the screen can say why, and it is always changeable
 * — a head start, never a decision made on someone's behalf.
 */
export function prefillFor(
  category: Category,
  intake: AnswerLookup,
): Prefilled | null {
  if (category.alwaysApplies) {
    return { answer: "Yes", because: category.because! };
  }
  for (const rule of category.prefill) {
    if (matches(rule.when, intake)) {
      return { answer: rule.answer, because: rule.because };
    }
  }
  return null;
}

export type GateState = {
  category: Category;
  /** The current answer, if one exists. */
  answer: "Yes" | "No" | null;
  /** True when nobody stated it here and nobody has confirmed it. */
  fromIntake: boolean;
  /**
   * Where a pre-filled answer came from: intake alone, or another answer in
   * this assessment. The screen says different things for the two, because
   * "answered from your intake" attributed to a person a sentence they
   * never said when the real source was another gate.
   */
  origin: "intake" | "answers" | null;
  because: string | null;
  /** True where nobody is asked because the area always applies (C-8). */
  settled: boolean;
};

/**
 * Fold stored answers and pre-fill into one state per category.
 *
 * Two passes, because a gate may be answered by another gate: "a system is
 * being built" answers "connections and access change". The
 * first pass resolves everything a person or intake settled; the second
 * lets the remaining gates read those answers. One level only — a gate may
 * not pre-fill from a gate that was itself pre-filled — so there is no
 * order to get wrong and no cycle to detect at runtime. The validator
 * refuses a rule that reads its own gate.
 */
export function gateStates(
  // A stored answer may be a string, a list, or — from Tier 3 — an object.
  // Gates read only the first; anything else simply does not match, which
  // is the positive-evidence rule doing its job (§3.2.1).
  stored: Record<string, { value: unknown; source: string; confirmed: boolean }>,
  intake: AnswerLookup,
  categories: Category[] = CATEGORIES,
): GateState[] {
  const settle = (
    category: Category,
    lookup: AnswerLookup,
    origin: "intake" | "answers",
  ): GateState => {
    if (category.alwaysApplies) {
      return {
        category,
        answer: "Yes" as const,
        // Not "from intake": nobody derived this from an answer, and it is
        // not changeable. Presenting it as a pre-fill would invite a person
        // to correct something that is not theirs to correct.
        fromIntake: false,
        origin: null,
        because: category.because ?? null,
        settled: true,
      };
    }
    const existing = stored[category.questionId];
    if (existing) {
      return {
        category,
        answer: existing.value === "Yes" ? "Yes" : "No",
        fromIntake: existing.source === "intake" && !existing.confirmed,
        origin: existing.source === "intake" && !existing.confirmed ? "intake" : null,
        because:
          existing.source === "intake" && !existing.confirmed
            ? (prefillFor(category, lookup)?.because ?? null)
            : null,
        settled: false,
      };
    }
    const prefilled = prefillFor(category, lookup);
    return {
      category,
      answer: prefilled?.answer ?? null,
      fromIntake: prefilled !== null,
      origin: prefilled === null ? null : origin,
      because: prefilled?.because ?? null,
      settled: false,
    };
  };

  // Settle what people and intake alone establish, then keep resolving
  // until nothing new appears. A fixed point rather than a fixed number of
  // passes, so chain depth never decides whether an authored rule works.
  let states = categories.map((category) => settle(category, intake, "intake"));
  for (let pass = 0; pass < categories.length; pass++) {
    const lookup: AnswerLookup = { ...intake };
    for (const state of states) {
      if (state.answer) lookup[`gate.${state.category.key}`] = state.answer;
    }
    const next = states.map((state) =>
      state.answer === null ? settle(state.category, lookup, "answers") : state,
    );
    const settledMore = next.some((s, i) => s.answer !== states[i]!.answer);
    states = next;
    // No new answer means no rule can fire again — the loop is bounded by
    // the number of categories, so a cycle cannot spin here even if the
    // validator ever let one through.
    if (!settledMore) break;
  }
  return states;
}

/** Progress the person can act on (§24.8): categories still unanswered. */
export function unansweredCount(states: GateState[]): number {
  return states.filter((s) => s.answer === null).length;
}

/** The categories a person is actually asked about — settled ones are not. */
export function askableCategories(): Category[] {
  return CATEGORIES.filter((c) => !c.alwaysApplies);
}

/**
 * The headline on the risk-area summary. Kept here, and pure, because it is
 * a claim about the person's progress and it must be true: encourage only
 * what the numbers actually support (§24.8).
 */
export function gateProgressHeadline(answered: number, total: number): string {
  if (total > 0 && answered >= total) return "That's the whole map.";
  if (answered === 0) return "Let's map the risk areas.";
  if (total - answered <= 2) return "Nearly there.";
  return `${answered} of ${total} areas answered.`;
}
