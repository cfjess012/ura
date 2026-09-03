/**
 * The one condition predicate (SPEC §3.2.3, §6.3, NFR-2). Pure: no
 * framework, no driver, no environment.
 *
 * Intake visibility, gate pre-fill, path derivation, Tier-2 routing, control
 * accumulation and Tier-3 follow-ups all route through `matches`, so there
 * is exactly one definition of "does this answer satisfy that rule". A
 * second evaluator is a defect by definition (§3.3).
 *
 * **Positive evidence only (§3.2.1): an unanswered field satisfies nothing
 * — not even a negative.** `notEqualsAny` and `excludesAll` on a field
 * nobody answered are false, and `not` holds only when everything inside
 * it is answered and false. Otherwise a rule could waive a control by
 * somebody leaving a box empty. `blank` is the one operator that reads
 * absence, and the lint confines it to intake visibility (G-77): a note
 * may appear because a box is empty; a risk area may never close because
 * one is.
 *
 * The language, as §6.3 promises it: equals / not-equals / includes /
 * excludes / answered / blank / numeric thresholds / severity-at-least,
 * with all / any / not nesting. `paths` and `path.<area>` are the aliases
 * for the same selection, flattened and per area (engine.ts).
 */

/**
 * The severity bands, worst last. The order lives here rather than with the
 * instrument because comparing two bands is an operator of this engine
 * (§6.3, `severity-at-least`) — a second ordering is a second evaluator.
 */
export const BANDS = ["Low", "Medium", "High"] as const;
export type Band = (typeof BANDS)[number];
const RANK: Record<Band, number> = { Low: 1, Medium: 2, High: 3 };

/** A rule about one field. */
export type LeafCondition =
  | { field: string; hasValue: true }
  | { field: string; blank: true }
  | { field: string; equalsAny: string[] }
  | { field: string; notEqualsAny: string[] }
  | { field: string; includesAny: string[] }
  | { field: string; excludesAll: string[] }
  | { field: string; atLeast: number }
  | { field: string; atMost: number }
  | { field: string; severityAtLeast: Band };

/** A rule, possibly built from others. */
export type Condition =
  | LeafCondition
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export type AnswerLookup = Record<string, string | string[] | undefined>;

/** The worst of some bands, or null for none — the engine's order, asked once. */
export function worstBand(bands: Band[]): Band | null {
  let held: Band | null = null;
  for (const band of bands) {
    if (held === null || RANK[band] > RANK[held]) held = band;
  }
  return held;
}

export function isNested(
  condition: Condition,
): condition is Exclude<Condition, LeafCondition> {
  return "all" in condition || "any" in condition || "not" in condition;
}

/** The leaf rules inside a condition, in reading order. */
export function leavesOf(condition: Condition): LeafCondition[] {
  if ("all" in condition) return condition.all.flatMap(leavesOf);
  if ("any" in condition) return condition.any.flatMap(leavesOf);
  if ("not" in condition) return leavesOf(condition.not);
  return [condition];
}

/** Every field a condition reads, without duplicates. */
export function fieldsOf(condition: Condition): string[] {
  return [...new Set(leavesOf(condition).map((leaf) => leaf.field))];
}

function answered(value: unknown): boolean {
  // Only a string or a list is an answer. Anything else — an object from a
  // prototype-named field, a number that leaked in — is not evidence.
  if (typeof value === "string") return value.trim().length > 0;
  return Array.isArray(value) && value.length > 0;
}

export function matches(condition: Condition, answers: AnswerLookup): boolean {
  if ("all" in condition) {
    return condition.all.every((c) => matches(c, answers));
  }
  if ("any" in condition) {
    return condition.any.some((c) => matches(c, answers));
  }
  if ("not" in condition) {
    // A negation is evidence only when there is evidence to negate: every
    // field inside must be answered, or an empty form would satisfy it.
    const inner = condition.not;
    const known = fieldsOf(inner).every((field) => answered(answers[field]));
    return known && !matches(inner, answers);
  }

  const value = answers[condition.field];
  if ("blank" in condition) return !answered(value);
  if (!answered(value)) return false;

  if ("hasValue" in condition) return true;
  if ("equalsAny" in condition) {
    return typeof value === "string" && condition.equalsAny.includes(value);
  }
  if ("notEqualsAny" in condition) {
    return typeof value === "string" && !condition.notEqualsAny.includes(value);
  }
  if ("severityAtLeast" in condition) {
    // An unknown band is not a low one — it satisfies nothing (§19).
    const held = typeof value === "string" ? RANK[value as Band] : undefined;
    return held !== undefined && held >= RANK[condition.severityAtLeast];
  }
  if ("atLeast" in condition || "atMost" in condition) {
    // A number the person typed, or nothing: a list is not a quantity, and
    // "about ten" is not one either.
    const n = typeof value === "string" ? Number(value) : Number.NaN;
    if (!Number.isFinite(n)) return false;
    return "atLeast" in condition ? n >= condition.atLeast : n <= condition.atMost;
  }
  // A single answer satisfies includes / excludes as a list of one (§19,
  // "scalar satisfies any_of") — the one deliberate change from the old
  // predicate, which treated a scalar as an empty list.
  const selected = Array.isArray(value) ? value : [value];
  if ("excludesAll" in condition) {
    return condition.excludesAll.every((option) => !selected.includes(option));
  }
  return condition.includesAny.some((option) => selected.includes(option));
}
