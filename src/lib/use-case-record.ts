/**
 * Assembling a destination record from answers already given (SPEC §27).
 *
 * The loudest complaint about assessment programmes is being asked the same
 * thing by different teams. The answer is not a better form; it is for the
 * assessment to become the source other systems draw from.
 *
 * Three rules, all of them §27's:
 *
 * - **The map is data, never code** (NFR-20). One file per destination in
 *   `src/data/reference/destinations/`. When the real field list arrives it
 *   is a file edit and a new version — nothing here changes.
 * - **The count is computed, never written down.** "16 of 22 already
 *   answered" is a claim the product makes, so the product has to work it
 *   out (G-34). Nothing here takes a number on trust.
 * - **What is still missing is never hidden.** It is the honest part.
 *
 * Pure: no framework, no driver, no environment (§26.1).
 */
import doc from "@/data/reference/destinations/ai-use-case-record.json";
import { ALL_FIELDS, type IntakeValues } from "./intake";

type MapField = {
  target: string;
  label: string;
  required: boolean;
  from?: string;
  derived?: string;
  needs?: string;
};

type DestinationMap = {
  slug: string;
  name: string;
  where: string;
  version: string;
  /** True while the field names are a working set, not the published list. */
  provisional: boolean;
  fields: MapField[];
};

export const AI_USE_CASE_RECORD = doc as DestinationMap;

/** Where a row's value came from — the honest third state included. */
export type RowSource =
  | { kind: "answered"; question: string; value: string }
  | { kind: "derived"; because: string }
  | { kind: "blank"; question: string }
  | { kind: "not-asked"; because: string };

export type RecordRow = {
  target: string;
  label: string;
  required: boolean;
  source: RowSource;
};

export type AssembledRecord = {
  name: string;
  where: string;
  version: string;
  provisional: boolean;
  rows: RecordRow[];
  /** Rows this assessment has already filled. The numerator on screen. */
  answered: number;
  /** Every row in the map. The denominator on screen. */
  total: number;
  /** Rows nothing can fill from here — named, never hidden (§27.3). */
  missing: RecordRow[];
};

const shown = (value: unknown): string => {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return value == null ? "" : String(value);
};

/**
 * The record as it stands, given what this assessment holds.
 *
 * `values` must be the READING form — labels, not ids — or the record
 * carries "BU_ENG" into another system's inventory (NFR-9).
 */
export function assembleUseCaseRecord(
  values: IntakeValues,
  map: DestinationMap = AI_USE_CASE_RECORD,
): AssembledRecord {
  const rows = map.fields.map((field): RecordRow => {
    if (field.derived)
      return {
        target: field.target,
        label: field.label,
        required: field.required,
        source: { kind: "derived", because: field.derived },
      };
    if (field.needs)
      return {
        target: field.target,
        label: field.label,
        required: field.required,
        source: { kind: "not-asked", because: field.needs },
      };
    const question =
      ALL_FIELDS.find((f) => f.id === field.from)?.label ?? field.from ?? "";
    const value = shown(values[field.from!]).trim();
    return {
      target: field.target,
      label: field.label,
      required: field.required,
      source:
        value === ""
          ? { kind: "blank", question }
          : { kind: "answered", question, value },
    };
  });

  return {
    name: map.name,
    where: map.where,
    version: map.version,
    provisional: map.provisional,
    rows,
    // Derived rows count: the assessment really does supply them. A blank
    // answer does not, and neither does a field nothing here asks about.
    answered: rows.filter(
      (r) => r.source.kind === "answered" || r.source.kind === "derived",
    ).length,
    total: rows.length,
    missing: rows.filter(
      (r) => r.source.kind === "blank" || r.source.kind === "not-asked",
    ),
  };
}

/**
 * Whether to offer registration at all (FR-26).
 *
 * Only when the assessment records AI. Offering it otherwise would be an
 * invitation to file something into an AI inventory that is not one.
 */
export function offerUseCaseRecord(values: IntakeValues): boolean {
  return String(values.usesAi ?? "").trim().toLowerCase() === "yes";
}
