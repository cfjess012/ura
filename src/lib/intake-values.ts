/**
 * Pure intake logic — no framework, no database, no environment (SPEC §26.1).
 *
 * This module is deliberately extractable: it imports nothing but the
 * instrument definition, so the same function can run inside a Next server
 * action today and inside a Lambda handler or an AgentCore task tomorrow
 * with no edit. Everything that *executes* (reading a request, writing a
 * row) lives outside it.
 */
import { ALL_FIELDS, type IntakeValues } from "./intake";

/** Runtime-agnostic input: field id → the values submitted for it. */
export type SubmittedEntries = Record<string, string[]>;

/**
 * Field ids the submission is responsible for. A submission covering part of
 * the instrument must say so, or the rest of it gets treated as cleared.
 */
export const SCOPE_KEY = "__scope";

/** What the persistence layer should store. `null` means "explicitly empty". */
export type IntakePatch = Record<string, string | string[] | null>;

/**
 * Map submitted entries onto the instrument's fields.
 *
 * Rules encoded here (and therefore testable without a database):
 * - notes ask nothing and store nothing;
 * - **only fields the submission is responsible for are written.** A form
 *   covering one section declares its scope; everything outside it is left
 *   exactly as it was. Without this, saving one section silently erased the
 *   multi-select answers in every other section — and the save reported
 *   success (found by independent verification, G-28);
 * - inside the declared scope a multi-select always writes an array, so
 *   clearing one genuinely persists;
 * - a blank date stores null, never "" — blank means "no date yet";
 * - a blank project name is ignored: the identity record keeps its name.
 */
export function intakePatchFrom(entries: SubmittedEntries): IntakePatch {
  const declared = entries[SCOPE_KEY];
  const scope = declared && declared.length > 0 ? new Set(declared) : null;
  const patch: IntakePatch = {};
  for (const field of ALL_FIELDS) {
    if (field.type === "note") continue;
    if (scope && !scope.has(field.id)) continue; // not this submission's business
    const submitted = entries[field.id];
    if (field.type === "multi") {
      patch[field.id] = submitted ?? [];
      continue;
    }
    if (submitted === undefined) continue;
    const value = submitted[0] ?? "";
    patch[field.id] =
      field.type === "date" && value.trim() === "" ? null : value;
  }
  if (
    typeof patch.projectName === "string" &&
    patch.projectName.trim() === ""
  ) {
    delete patch.projectName;
  }
  return patch;
}

/** Trim a proposed project name, or null when it cannot serve as one. */
export function projectNameOrNull(raw: unknown): string | null {
  const name = String(raw ?? "").trim();
  return name.length > 0 ? name : null;
}

/** Present values for a form, from whatever the store returned. */
export function intakeValuesFrom(row: Record<string, unknown>): IntakeValues {
  const values: IntakeValues = {};
  for (const field of ALL_FIELDS) {
    if (field.type === "note") continue;
    const raw = row[field.id];
    if (Array.isArray(raw)) values[field.id] = raw as string[];
    else values[field.id] = raw == null ? "" : String(raw);
  }
  return values;
}

/** One field's move from what it was to what it is now (F5). */
export type IntakeChange = {
  fieldId: string;
  previousValue: string | string[] | null;
  value: string | string[] | null;
};

/** True when two stored intake values are the same answer. */
function sameValue(
  a: string | string[] | null,
  b: string | string[] | null,
): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    if (left.length !== right.length) return false;
    return left.every((value, i) => value === right[i]);
  }
  return (a ?? "") === (b ?? "");
}

/**
 * What actually changed in a submission — the input to the attributed,
 * insert-only intake record.
 *
 * Only real moves are returned. A person who opens a section, changes one
 * field and saves should produce one line of history, not thirty; a history
 * padded with non-events is a history nobody reads.
 */
export function intakeChanges(
  previous: Record<string, unknown>,
  patch: IntakePatch,
): IntakeChange[] {
  const changes: IntakeChange[] = [];
  for (const [fieldId, value] of Object.entries(patch)) {
    const before = previous[fieldId];
    const previousValue: string | string[] | null = Array.isArray(before)
      ? (before as string[])
      : before == null
        ? null
        : String(before);
    if (sameValue(previousValue, value)) continue;
    changes.push({ fieldId, previousValue, value });
  }
  return changes;
}
