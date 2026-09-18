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
  /**
   * Worked out rather than asked. `value` is what it worked out to, when
   * the caller could supply it — a derived row counts toward `answered`,
   * so a payload that carried nothing for it would be claiming a field it
   * does not have. Absent when this assembly had no way to compute it,
   * which the screen says rather than filling in.
   */
  | { kind: "derived"; because: string; value?: string }
  /** `from` is the intake field, so a screen can send somebody to answer it. */
  | { kind: "blank"; question: string; from: string }
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
  /**
   * What the platform worked out, keyed by target field. Supplied by the
   * caller because deriving it needs the answers and the engine, and this
   * module is pure (§26.1) — it knows the map, never the assessment.
   */
  derivations: Record<string, string> = {},
  map: DestinationMap = AI_USE_CASE_RECORD,
): AssembledRecord {
  const rows = map.fields.map((field): RecordRow => {
    if (field.derived) {
      const worked = derivations[field.target]?.trim();
      return {
        target: field.target,
        label: field.label,
        required: field.required,
        source: {
          kind: "derived",
          because: field.derived,
          ...(worked ? { value: worked } : {}),
        },
      };
    }
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
          ? { kind: "blank", question, from: field.from! }
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

/**
 * The payload this record would file (FR-27).
 *
 * Two rules, both of them §27.4's, and both about the file outliving the
 * screen that explained it. A downloaded file gets mailed on, and whoever
 * opens it next did not read the caveat beside the button.
 *
 * - **A missing field is present and says why it is missing.** Dropping the
 *   key would let a reader count the fields and conclude the record is
 *   complete. This is the same rule the export follows for N-A (FR-20):
 *   absence is stated, never implied.
 * - **The payload says it was never sent.** There is no connection to the
 *   destination and there is no field that could hold one — a `status` key
 *   is how "not connected" quietly becomes "not sent yet" and then a state
 *   somebody trusts.
 */
export type RecordPayload = {
  destination: {
    name: string;
    where: string;
    mapVersion: string;
    /** True while the field names are ours rather than the destination's. */
    provisional: boolean;
  };
  assembledAt: string;
  assembledBy: string;
  fields: Array<{
    field: string;
    label: string;
    required: boolean;
    value: string | null;
    /** The question this came from, for a value the requester gave. */
    from?: string;
    /** Why it is derived, for a value the platform worked out. */
    derived?: string;
    /** Why it is empty, for a value nothing here can supply. */
    missing?: string;
  }>;
  notFiled: string;
};

export const NOT_FILED =
  "Nothing here has been sent. This platform has no connection to the AI use case inventory, so this file is a payload, not a receipt.";

export function useCaseRecordPayload(
  record: AssembledRecord,
  by: string,
  at: Date,
): RecordPayload {
  return {
    destination: {
      name: record.name,
      where: record.where,
      mapVersion: record.version,
      provisional: record.provisional,
    },
    assembledAt: at.toISOString(),
    assembledBy: by,
    fields: record.rows.map((row) => {
      const base = {
        field: row.target,
        label: row.label,
        required: row.required,
      };
      switch (row.source.kind) {
        case "answered":
          return { ...base, value: row.source.value, from: row.source.question };
        case "derived":
          return {
            ...base,
            value: row.source.value ?? null,
            derived: row.source.because,
            ...(row.source.value
              ? {}
              : { missing: "Worked out when this is filed." }),
          };
        case "blank":
          return {
            ...base,
            value: null,
            missing: `Not answered yet: ${row.source.question}.`,
          };
        case "not-asked":
          return { ...base, value: null, missing: row.source.because };
      }
    }),
    notFiled: NOT_FILED,
  };
}

/** A filename that says what it is and which assessment it came from. */
export function recordFilename(assessment: string, at: Date): string {
  const slug =
    assessment
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "assessment";
  return `ai-use-case-record-${slug}-${at.toISOString().slice(0, 10)}.json`;
}
