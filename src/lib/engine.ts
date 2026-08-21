/**
 * The assessment engine (SPEC §3.2, FR-4/FR-5/FR-9, NFR-2/NFR-3/NFR-4).
 *
 * Pure: no framework, no driver, no environment. Everything here is a
 * function of the answers given, so nothing it produces is ever stored —
 * change an upstream answer and the whole downstream re-derives for free.
 * That is the point of the slice: *derived state is computed, never
 * persisted*, so it cannot drift away from the answers it came from.
 *
 * One namespace, one predicate. Intake fields, gate answers and path
 * selections are folded into a single lookup so a rule can read any of
 * them without a second evaluator existing anywhere (NFR-2).
 */
import { matches, type AnswerLookup, type Condition } from "./conditions";
import type { Category, GateState } from "./instrument";

/** Prefix for a gate's answer in the shared namespace: `gate.third-party`. */
const GATE = (key: string) => `gate.${key}`;
/** Prefix for a category's path selections: `path.third-party`. */
const PATH = (key: string) => `path.${key}`;
/** Every lit path id, flattened — so a rule can ask `includesAny: ["PRIV"]`. */
const ALL_PATHS = "paths";

/**
 * All conditions must hold. The one predicate stays one predicate: this
 * folds over `matches` rather than interpreting anything itself, so there
 * is still exactly one definition of "does this answer satisfy that rule".
 */
export function matchesAll(
  conditions: Condition[],
  answers: AnswerLookup,
): boolean {
  return conditions.every((condition) => matches(condition, answers));
}

/** A path the assessment has lit, and why it is lit. */
export type LitPath = {
  id: string;
  name: string;
  /** The category that owns it. */
  categoryKey: string;
  /**
   * `chosen` — a person selected it. `derived` — the engine lit it from
   * evidence already given, and `because` says what that evidence was.
   */
  source: "chosen" | "derived";
  /**
   * Every reason that lit it, not the first one (§19).
   *
   * Two rules can both be satisfied for one path, and the second reason is
   * not redundant — it is a separate fact about the assessment, and a
   * reviewer who sees only the first is reading an incomplete record.
   * Independent verification found the previous single-string version
   * silently discarding the second.
   */
  because: string[];
};

/**
 * Build the shared namespace every rule reads.
 *
 * Deliberately flat: a rule says `{ field: "gate.ai", equalsAny: ["Yes"] }`
 * and does not care whether that came from intake, a gate, or a path. New
 * answer kinds join by adding a prefix here, not by teaching the predicate
 * a new shape.
 */
export function assessmentLookup(input: {
  intake: AnswerLookup;
  gates: GateState[];
  pathSelections: Record<string, string[]>;
}): AnswerLookup {
  const lookup: AnswerLookup = { ...input.intake };
  for (const state of input.gates) {
    if (state.answer) lookup[GATE(state.category.key)] = state.answer;
  }
  const everyPath: string[] = [];
  for (const [categoryKey, selected] of Object.entries(input.pathSelections)) {
    lookup[PATH(categoryKey)] = selected;
    everyPath.push(...selected);
  }
  lookup[ALL_PATHS] = everyPath;
  return lookup;
}

/**
 * Which paths are lit for one category.
 *
 * Two ways in, and the difference is visible to the person: they chose it,
 * or the engine derived it from something they already said. A derived path
 * always carries its reason — an assessment that expands without saying why
 * is one people stop trusting (§24.5).
 */
export function litPathsFor(
  category: Category,
  selected: string[],
  lookup: AnswerLookup,
): LitPath[] {
  const lit: LitPath[] = [];
  const seen = new Set<string>();
  for (const option of category.pathQuestion?.options ?? []) {
    if (!selected.includes(option.id) || seen.has(option.id)) continue;
    seen.add(option.id);
    lit.push({
      id: option.id,
      name: option.label,
      categoryKey: category.key,
      source: "chosen",
      because: [],
    });
  }
  for (const derived of category.derivedPaths ?? []) {
    if (!matchesAll(derived.when, lookup)) continue;
    const already = lit.find((p) => p.id === derived.id);
    if (already) {
      // A second satisfied rule for the same path keeps its reason too.
      if (!already.because.includes(derived.because))
        already.because.push(derived.because);
      continue;
    }
    seen.add(derived.id);
    lit.push({
      id: derived.id,
      name: derived.name,
      categoryKey: category.key,
      source: "derived",
      because: [derived.because],
    });
  }
  return lit;
}

/**
 * Every lit path across the assessment, in instrument order.
 *
 * Two passes, because a derived path may depend on another category's
 * selections — "personal information used with AI" needs the privacy path
 * and the AI gate, which belong to different categories. The first pass
 * establishes what was chosen; the second lets derivations see all of it.
 * Derived paths may not depend on other derived paths: one level, no
 * cycles, and the validator enforces it.
 */
export function litPaths(
  categories: Category[],
  gates: GateState[],
  pathSelections: Record<string, string[]>,
  intake: AnswerLookup,
): LitPath[] {
  const open = categories.filter(
    (c) => gates.find((g) => g.category.key === c.key)?.answer === "Yes",
  );
  const chosenOnly: Record<string, string[]> = {};
  for (const category of open) {
    const selected = pathSelections[category.key] ?? [];
    chosenOnly[category.key] = (category.pathQuestion?.options ?? [])
      .filter((o) => selected.includes(o.id))
      .map((o) => o.id);
  }
  const lookup = assessmentLookup({ intake, gates, pathSelections: chosenOnly });
  return open.flatMap((category) =>
    litPathsFor(category, chosenOnly[category.key] ?? [], lookup),
  );
}
