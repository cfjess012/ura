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
import {
  answerFor,
  entriesOf,
  type ReferenceAnswer,
  type ReferenceEntry,
} from "./reference";

/** Runtime-agnostic input: field id → the values submitted for it. */
export type SubmittedEntries = Record<string, string[]>;

/**
 * Field ids the submission is responsible for. A submission covering part of
 * the instrument must say so, or the rest of it gets treated as cleared.
 */
export const SCOPE_KEY = "__scope";

/** What the persistence layer should store. `null` means "explicitly empty". */
export type IntakePatch = Record<
  string,
  string | string[] | ReferenceAnswer | ReferenceAnswer[] | null
>;

/**
 * The option a person picks when the list does not hold their answer
 * (FR-30, FR-31). A sentinel rather than free text, so "they chose to go
 * off-list" is a decision in the submission, not something inferred from a
 * string that happens not to match.
 */
export const UNLISTED_OPTION = "__something-else__";

/** Where the typed name for that choice arrives. */
export const unlistedKey = (fieldId: string) => `${fieldId}__unlisted`;

/**
 * The employee directory, passed in rather than imported.
 *
 * People are operational, not versioned (G-46's exception) — a real
 * deployment resolves them from an IdP — so this module cannot know them.
 * The executor loads them and hands them over, and this stays pure (§26.1).
 */
export type Directory = ReferenceEntry[];

function optionsFor(list: string, directory: Directory): ReferenceEntry[] {
  return list === "people" ? directory : entriesOf(list);
}

/** One chosen id, or one typed name, as the answer that gets stored. */
function referenceAnswer(
  list: string,
  chosen: string,
  typed: string,
  directory: Directory,
  version: string,
): ReferenceAnswer | null {
  if (chosen === UNLISTED_OPTION) {
    const name = typed.trim();
    return name === "" ? null : { unlisted: name };
  }
  if (list === "people") {
    const person = directory.find((p) => p.id === chosen);
    // The label is stored beside the id even here: a person's name changes,
    // and the record must keep saying who the requester actually chose.
    return person ? { id: person.id, label: person.label, version } : null;
  }
  return answerFor(list, chosen);
}

/**
 * Map submitted entries onto the instrument's fields.
 *
 * Rules encoded here (and therefore testable without a database):
 * - notes ask nothing and store nothing;
 * - **only fields the submission is responsible for are written.** A form
 *   covering one section declares its scope; everything outside it is left
 *   exactly as it was. Without it, saving one section clears the
 *   multi-select answers in every other one, and reports success (G-28);
 * - inside the declared scope a multi-select always writes an array, so
 *   clearing one genuinely persists;
 * - a blank date stores null, never "" — blank means "no date yet";
 * - a blank project name is ignored: the identity record keeps its name.
 */
export function intakePatchFrom(
  entries: SubmittedEntries,
  directory: Directory = [],
): IntakePatch {
  const declared = entries[SCOPE_KEY];
  const scope = declared && declared.length > 0 ? new Set(declared) : null;
  const patch: IntakePatch = {};
  for (const field of ALL_FIELDS) {
    if (field.type === "note") continue;
    if (scope && !scope.has(field.id)) continue; // not this submission's business
    const submitted = entries[field.id];
    if (field.type === "pick" || field.type === "pick-many") {
      const list = field.list!;
      const typed = entries[unlistedKey(field.id)]?.[0] ?? "";
      const chosen = submitted ?? (scope ? [] : undefined);
      if (chosen === undefined) continue;
      // "people" has no version of its own — it is operational. The date
      // the answer was given is what a reader needs, and the row already
      // carries that.
      const version = list === "people" ? "directory" : "";
      const answers = chosen
        .filter((id) => id !== "")
        .map((id) => referenceAnswer(list, id, typed, directory, version))
        .filter((a): a is ReferenceAnswer => a !== null);
      patch[field.id] = field.type === "pick" ? (answers[0] ?? null) : answers;
      continue;
    }
    if (field.type === "multi") {
      // Inside a declared scope, an absent multi-select means "cleared" and
      // must persist. With no scope declared we cannot tell "cleared" from
      // "not part of this form", so we leave it alone — the safe reading.
      if (scope) patch[field.id] = submitted ?? [];
      else if (submitted !== undefined) patch[field.id] = submitted;
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

/** One field's move from what it was to what it is now. */
export type IntakeStored = string | string[] | ReferenceAnswer | ReferenceAnswer[] | null;

export type IntakeChange = {
  fieldId: string;
  previousValue: IntakeStored;
  value: IntakeStored;
};

/**
 * True when two stored intake values are the same answer.
 *
 * Compared by content, not identity, and structurally rather than by
 * stringifying: a reference answer that differs only in the list version it
 * was pinned to IS a different answer, because the version is part of what
 * the record says.
 */
function sameValue(a: IntakeStored, b: IntakeStored): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    if (left.length !== right.length) return false;
    return left.every((value, i) => sameValue(value as IntakeStored, right[i] as IntakeStored));
  }
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every(
      (k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k],
    );
  }
  // Guarded on null explicitly: `typeof null === "object"`, so without this
  // an absent value and an empty one stop looking like the same non-event.
  if ((a !== null && typeof a === "object") || (b !== null && typeof b === "object"))
    return false;
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
    const previousValue: IntakeStored =
      before == null
        ? null
        : Array.isArray(before) || typeof before === "object"
          ? (before as IntakeStored)
          : String(before);
    if (sameValue(previousValue, value)) continue;
    changes.push({ fieldId, previousValue, value });
  }
  return changes;
}
