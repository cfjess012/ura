/**
 * A question's own words, from its id — for any surface that has an id and
 * needs to show a person something they recognise (NFR-9).
 *
 * Pure, and it reads the instrument rather than a copy: a label stored
 * beside a hand-off would drift the first time a question is reworded, and
 * then a pinned alert would name a question nobody can find.
 */
import { CATEGORIES } from "./instrument";
import { SEVERITY_QUESTIONS } from "./severity";
import { ALL_FIELDS } from "./intake";

export function questionLabelFor(questionId: string): string {
  const severity = SEVERITY_QUESTIONS.find((q) => q.questionId === questionId);
  if (severity) return severity.name;
  const detail = SEVERITY_QUESTIONS.find((q) => q.detail?.questionId === questionId);
  if (detail) return detail.detail!.text;
  const category = CATEGORIES.find(
    (c) => c.questionId === questionId || c.pathQuestion?.questionId === questionId,
  );
  if (category) return category.name;
  const field = ALL_FIELDS.find((f) => f.id === questionId);
  if (field) return field.label;
  // Never the id. A question we cannot name is a question we should not be
  // showing, and saying so is better than printing an identifier at someone.
  return "a question in this assessment";
}
