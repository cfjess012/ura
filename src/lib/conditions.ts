/**
 * The one condition predicate (SPEC §3.2.3, NFR-2). Pure: no framework, no
 * driver, no environment.
 *
 * Intake visibility, gate pre-fill and Tier-2 routing all route through this
 * function, so there is exactly one definition of "does this answer satisfy
 * that rule". A second evaluator is a defect by definition (§3.3).
 *
 * Positive evidence only (§3.2.1): an unanswered field satisfies nothing.
 */

/**
 * The severity bands, worst last. The order lives here rather than with the
 * instrument because comparing two bands is an operator of this engine
 * (§6.3, `severity-at-least`) — a second ordering is a second evaluator.
 */
export const BANDS = ["Low", "Medium", "High"] as const;
export type Band = (typeof BANDS)[number];
const RANK: Record<Band, number> = { Low: 1, Medium: 2, High: 3 };

export type Condition =
  | { field: string; hasValue: true }
  | { field: string; equalsAny: string[] }
  | { field: string; includesAny: string[] }
  | { field: string; severityAtLeast: Band };

export type AnswerLookup = Record<string, string | string[] | undefined>;

export function matches(condition: Condition, answers: AnswerLookup): boolean {
  const value = answers[condition.field];
  if (value === undefined || value === null) return false;

  if ("hasValue" in condition) {
    return Array.isArray(value) ? value.length > 0 : value.trim().length > 0;
  }
  if ("equalsAny" in condition) {
    return typeof value === "string" && condition.equalsAny.includes(value);
  }
  if ("severityAtLeast" in condition) {
    // An unknown band is not a low one — it satisfies nothing (§19).
    const held = typeof value === "string" ? RANK[value as Band] : undefined;
    return held !== undefined && held >= RANK[condition.severityAtLeast];
  }
  const selected = Array.isArray(value) ? value : [];
  return condition.includesAny.some((option) => selected.includes(option));
}
