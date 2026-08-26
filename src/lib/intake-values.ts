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
  isUnlisted,
  labelOf,
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

/** One chosen id as the answer that gets stored. */
function referenceAnswer(
  list: string,
  chosen: string,
  directory: Directory,
  version: string,
): ReferenceAnswer | null {
  if (list === "people") {
    const person = directory.find((p) => p.id === chosen);
    // The label is stored beside the id even here: a person's name changes,
    // and the record must keep saying who the requester actually chose.
    return person ? { id: person.id, label: person.label, version } : null;
  }
  return answerFor(list, chosen);
}

/** Names typed into the off-list box. A pick-many takes one per line. */
function typedNames(raw: string, many: boolean): string[] {
  return (many ? raw.split(/[\n,]/) : [raw]).map((n) => n.trim()).filter(Boolean);
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
      const many = field.type === "pick-many";
      const list = field.list!;
      const typed = entries[unlistedKey(field.id)]?.[0] ?? "";
      const chosen = submitted ?? (scope ? [] : undefined);
      if (chosen === undefined) continue;
      // "people" has no version of its own — it is operational, and the row
      // already records when the answer was given.
      const version = list === "people" ? "directory" : "";
      const answers: ReferenceAnswer[] = [];
      for (const id of chosen) {
        if (id === "") continue;
        if (id === UNLISTED_OPTION) {
          for (const name of typedNames(typed, many)) answers.push({ unlisted: name });
          continue;
        }
        const answer = referenceAnswer(list, id, directory, version);
        // An id that is not on the list is dropped rather than guessed at.
        if (answer) answers.push(answer);
      }
      patch[field.id] = many ? answers : (answers[0] ?? null);
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

/**
 * Present values for a form, from whatever the store returned.
 *
 * A reference answer comes back as the ids the picker should show selected,
 * plus the typed text in its own key — the exact inverse of what
 * `intakePatchFrom` consumes, so a saved answer reloads as what the person
 * chose rather than as something approximating it.
 */
export function intakeValuesFrom(row: Record<string, unknown>): IntakeValues {
  const values: IntakeValues = {};
  for (const field of ALL_FIELDS) {
    if (field.type === "note") continue;
    const raw = row[field.id];
    if (field.type === "pick" || field.type === "pick-many") {
      const stored = (Array.isArray(raw) ? raw : raw ? [raw] : []) as ReferenceAnswer[];
      const ids: string[] = [];
      const typed: string[] = [];
      for (const answer of stored) {
        if (isUnlisted(answer)) {
          typed.push(answer.unlisted);
          if (!ids.includes(UNLISTED_OPTION)) ids.push(UNLISTED_OPTION);
        } else if (answer?.id) ids.push(answer.id);
      }
      values[field.id] = field.type === "pick-many" ? ids : (ids[0] ?? "");
      values[unlistedKey(field.id)] = typed.join("\n");
      continue;
    }
    if (Array.isArray(raw)) values[field.id] = raw as string[];
    else values[field.id] = raw == null ? "" : String(raw);
  }
  return values;
}

/**
 * The same answers, but as a person would read them — labels, never ids.
 *
 * `intakeValuesFrom` flattens a reference answer to its bare id because a
 * form needs that to pre-select an option. Anything that will be READ needs
 * the opposite, and handing the id to a model is the worse half of the same
 * mistake twice over: the id reaches the screen (NFR-9), and the model,
 * given an opaque token it cannot verify, writes a plausible one instead.
 * Observed 2026-08-26: the intake check told a person their business unit
 * was "BU_ENG" and named two owners — d.grant and d.reyes — who had never
 * been on the assessment at all.
 *
 * The same defect was found once before and fixed at a single caller
 * (`declarableFrom`, verifier B2). This is the shared point, so there is
 * one place to call rather than a rule every future caller must remember.
 */
export function intakeValuesForReading(
  row: Record<string, unknown>,
): IntakeValues {
  const values = intakeValuesFrom(row);
  for (const field of ALL_FIELDS) {
    if (field.type !== "pick" && field.type !== "pick-many") continue;
    const raw = row[field.id];
    const stored = (
      Array.isArray(raw) ? raw : raw ? [raw] : []
    ) as ReferenceAnswer[];
    const shown = stored
      .map((answer) =>
        isUnlisted(answer) ? answer.unlisted : labelOf(answer),
      )
      // A stored value that is not a reference answer — a legacy row, or a
      // caller that handed over already-flattened values — has no label, and
      // `labelOf` returns undefined rather than throwing. Filtering on
      // `label.trim()` then threw INSIDE a render and took the whole screen
      // to the error boundary. A reading helper may return less than it
      // hoped for; it may not bring down the page it is read on.
      .filter((label): label is string => typeof label === "string" && label.trim() !== "");
    values[field.id] = field.type === "pick-many" ? shown : (shown[0] ?? "");
    // The off-list text is already in the label above; repeating it under
    // its own key would say the same answer twice to the model.
    delete values[unlistedKey(field.id)];
  }
  return values;
}

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
