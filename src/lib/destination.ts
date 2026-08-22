/**
 * Where a thing lives, so an alert can land a person on it (skill:
 * alert-destination).
 *
 * One function, derived from the subject. A destination assembled at the
 * call site drifts the moment there are two kinds of alert, and the first
 * one shipped pointing at the project root — which the intake guard then
 * redirected, so the person arrived at the top of a form with no idea why.
 *
 * Pure: no framework, no driver, no environment (§26.1).
 */
import { CATEGORIES } from "./instrument";
import { SEVERITY_QUESTIONS } from "./severity";
import { ALL_FIELDS, INTAKE_SECTIONS, sectionKey } from "./intake";

/** The anchor every surface reads. One word, the same everywhere. */
export const FOCUS = "focus";

export type Destination = {
  href: string;
  /** What the person is being sent to, in its own words. */
  label: string;
};

const groupKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * The screen a question lives on, with the question as the anchor.
 *
 * Returns null when the subject has no screen of its own — the caller then
 * says so rather than guessing at the nearest page.
 */
export function destinationFor(projectId: string, questionId: string): Destination | null {
  const base = `/projects/${projectId}`;
  const anchor = `?${FOCUS}=${encodeURIComponent(questionId)}`;

  const severity = SEVERITY_QUESTIONS.find(
    (q) => q.questionId === questionId || q.detail?.questionId === questionId,
  );
  if (severity)
    return {
      href: `${base}/assess/severity/${groupKey(severity.category)}${anchor}`,
      label: severity.name,
    };

  const path = CATEGORIES.find((c) => c.pathQuestion?.questionId === questionId);
  if (path) return { href: `${base}/assess/paths${anchor}`, label: path.pathQuestion!.text };

  const gate = CATEGORIES.find((c) => c.questionId === questionId);
  if (gate) return { href: `${base}/assess/${gate.key}${anchor}`, label: gate.name };

  const field = ALL_FIELDS.find((f) => f.id === questionId);
  if (field) {
    const section = INTAKE_SECTIONS.find((s) => s.fields.some((f) => f.id === field.id));
    if (section)
      return { href: `${base}/intake/${sectionKey(section.name)}${anchor}`, label: field.label };
  }
  return null;
}
