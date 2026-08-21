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

/** What the persistence layer should store. `null` means "explicitly empty". */
export type IntakePatch = Record<string, string | string[] | null>;

/**
 * Map submitted entries onto the instrument's fields.
 *
 * Rules encoded here (and therefore testable without a database):
 * - notes ask nothing and store nothing;
 * - multi-selects always write an array, so clearing one persists;
 * - a blank date stores null, never "" — blank means "no date yet";
 * - a blank project name is ignored: the identity record keeps its name.
 */
export function intakePatchFrom(entries: SubmittedEntries): IntakePatch {
  const patch: IntakePatch = {};
  for (const field of ALL_FIELDS) {
    if (field.type === "note") continue;
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

/**
 * The technology/non-technology classification the risk organisation needs
 * for queue routing — DERIVED, never asked (G-19). Deriving beats asking:
 * a business user classifying a SaaS purchase or a spreadsheet process is
 * guessing, and a guess at the front door corrupts everything routed from it.
 */
export function isTechnologyActivity(values: IntakeValues): boolean {
  const selected = values.activityTypes;
  if (!Array.isArray(selected)) return false;
  return selected.some((option) => /system, application, or software/i.test(option));
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
