/**
 * The one condition predicate (SPEC §3.2.3, NFR-2). Pure: no framework, no
 * driver, no environment.
 *
 * Intake visibility and gate pre-fill both route through this function, so
 * there is exactly one definition of "does this answer satisfy that rule".
 * A second evaluator is a defect by definition.
 *
 * Positive evidence only (§3.2.1): an unanswered field satisfies nothing.
 */

export type Condition =
  | { field: string; hasValue: true }
  | { field: string; equalsAny: string[] }
  | { field: string; includesAny: string[] };

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
  const selected = Array.isArray(value) ? value : [];
  return condition.includesAny.some((option) => selected.includes(option));
}
