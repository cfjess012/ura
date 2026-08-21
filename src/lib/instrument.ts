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

export type GatePrefill = {
  answer: "Yes" | "No";
  when: Condition;
  /** Plain-language reason shown to the person (FR-22, §24.4). */
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
   * (audit C-8, G-36). The category is not removed and its risk coverage
   * does not change — the *question* is. A gate answered the same way by
   * everyone sorts nobody, and a question with a foregone answer spends a
   * person's attention for nothing.
   */
  alwaysApplies?: boolean;
  /** Why it always applies, in the words shown to the person. */
  because?: string;
};

export type Instrument = {
  slug: string;
  version: string;
  categories: Category[];
};

function validate(candidate: Instrument): Instrument {
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
    for (const rule of category.prefill ?? []) {
      if (rule.answer !== "Yes" && rule.answer !== "No")
        problems.push(`${where}: prefill answer must be Yes or No`);
      if (!rule.because?.trim())
        problems.push(`${where}: prefill needs a plain-language reason`);
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
  /** True when the answer came from intake and nobody has confirmed it. */
  fromIntake: boolean;
  because: string | null;
  /** True where nobody is asked because the area always applies (C-8). */
  settled: boolean;
};

/** Fold stored answers and intake pre-fill into one state per category. */
export function gateStates(
  stored: Record<string, { value: string; source: string; confirmed: boolean }>,
  intake: AnswerLookup,
): GateState[] {
  return CATEGORIES.map((category) => {
    if (category.alwaysApplies) {
      return {
        category,
        answer: "Yes" as const,
        // Not "from intake": nobody derived this from an answer, and it is
        // not changeable. Presenting it as a pre-fill would invite a person
        // to correct something that is not theirs to correct.
        fromIntake: false,
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
        because:
          existing.source === "intake" && !existing.confirmed
            ? (prefillFor(category, intake)?.because ?? null)
            : null,
        settled: false,
      };
    }
    const prefilled = prefillFor(category, intake);
    return {
      category,
      answer: prefilled?.answer ?? null,
      fromIntake: prefilled !== null,
      because: prefilled?.because ?? null,
      settled: false,
    };
  });
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
 * a claim about the person's progress and it must be true: the screen used
 * to say "Nearly there." with ten of eleven areas unanswered (F6). Encourage
 * only what the numbers actually support (§24.8).
 */
export function gateProgressHeadline(answered: number, total: number): string {
  if (total > 0 && answered >= total) return "That's the whole map.";
  if (answered === 0) return "Let's map the risk areas.";
  if (total - answered <= 2) return "Nearly there.";
  return `${answered} of ${total} areas answered.`;
}
