/**
 * The intake instrument as DATA (SPEC §3.1, FR-1) — ordered sections with
 * conditional fields, transcribed from the accepted reference design and
 * refined in the S1 review (2026-08-21).
 *
 * Design rules this file obeys:
 * - Plain language only; no GRC acronyms as the primary ask, no internal
 *   identifiers (NFR-9). Field ids are internal and never rendered.
 * - Nothing here is asked twice at Tier 1: fields that duplicate a gate are
 *   marked `prefillsGate` so S2 can pre-answer that gate visibly and
 *   changeably (FR-22). This file states the intent; S2 owns the mechanism.
 * - "Unknown" is a legitimate answer wherever a requester may genuinely
 *   lack visibility (FR-23) — the front door never manufactures certainty.
 */

export type IntakeCondition =
  | { visibleWhen: string; hasValue: true }
  | { visibleWhen: string; equalsAny: string[] }
  | { visibleWhen: string; includesAny: string[] };

export type IntakeField = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "multi" | "date" | "note";
  required?: boolean;
  options?: string[];
  help?: string;
  /** For type "note": the reassurance shown. Notes ask nothing and store nothing. */
  body?: string;
  conditional?: IntakeCondition;
  /** Plain-language reason shown when a conditional field reveals. */
  revealNote?: string;
  /**
   * FR-22: this answer also answers a Tier-1 gate. Recorded here as the
   * instrument's own statement of intent; the consuming logic arrives with
   * the gates in S2 (SPEC Build Rule 5 — no building ahead).
   */
  prefillsGate?: string;
};

export type IntakeSection = { name: string; fields: IntakeField[] };

export type IntakeValues = Record<string, string | string[]>;

/** Initiative types that mean "there is prior work to look up". */
const UPDATE_TYPES = [
  "An update or enhancement to something we already run",
  "A vendor renewal",
  "Moving a proof of concept into production",
];

export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    name: "Description",
    fields: [
      {
        id: "projectName",
        label: "Project Name",
        type: "text",
        required: true,
      },
      {
        id: "businessPurpose",
        label: "Business Purpose or Objective",
        type: "textarea",
        required: true,
      },
      {
        id: "projectDescription",
        label: "Activity / Use-Case Description",
        type: "textarea",
        required: true,
        help: "What the activity does, who it touches, and how it works — in plain terms.",
      },
      {
        id: "usesAi",
        label: "Does this use AI or machine learning?",
        type: "select",
        options: ["Yes", "No", "I'm not sure"],
        required: true,
        help: "Includes AI features inside a vendor's product, not just models you build.",
        prefillsGate: "AI",
      },
      {
        id: "aiUseCase",
        label: "What does the AI do?",
        type: "textarea",
        conditional: { visibleWhen: "usesAi", equalsAny: ["Yes"] },
        revealNote:
          "Shown because you told us this uses AI or machine learning.",
        help: "What it decides or produces, what data it uses, and how much a person reviews before anything happens.",
      },
      {
        // Never re-ask what someone just told you they do not know (§24.1).
        // Uncertainty is absorbed and routed, not returned to the requester.
        id: "usesAiUnsure",
        label: "We'll find out for you",
        type: "note",
        conditional: { visibleWhen: "usesAi", equalsAny: ["I'm not sure"] },
        body: "No problem — you don't need to know. A Risk Assessor will confirm whether AI is involved, and until they do we'll treat this as if it might be. Nothing here is blocked while that's checked.",
      },
    ],
  },
  {
    name: "Ownership",
    fields: [
      {
        id: "businessOwner",
        label: "Business Owner",
        type: "text",
        required: true,
      },
      { id: "technicalOwner", label: "Technical Owner", type: "text" },
      { id: "collaborators", label: "Collaborators", type: "text" },
      {
        id: "initiativeType",
        label: "Is this a new initiative, or an update to an existing one?",
        type: "select",
        options: ["Brand new", ...UPDATE_TYPES, "Something else"],
        required: true,
        prefillsGate: "TPR/SA",
      },
      {
        id: "priorAssessmentRef",
        label: "Which assessment or ticket does it build on, if you know?",
        type: "text",
        conditional: { visibleWhen: "initiativeType", equalsAny: UPDATE_TYPES },
        revealNote:
          "Shown because this builds on existing work — it helps reviewers find the prior file.",
        help: "A name, number, or link is plenty. Leave blank if you don't know.",
      },
    ],
  },
  {
    name: "Categorization",
    fields: [
      {
        id: "businessUnit",
        label: "Responsible Business Unit",
        type: "text",
        required: true,
      },
      {
        id: "otherUnits",
        label: "Other Business Units Involved",
        type: "text",
        conditional: { visibleWhen: "businessUnit", hasValue: true },
        revealNote: "Shown because a responsible business unit was entered.",
      },
      {
        id: "targetGoLive",
        label: "Target Go-Live / Launch Date",
        type: "date",
        help: "Leave blank if there isn't a date yet — reviewers would rather see blank than a guess.",
      },
      {
        id: "vendorNames",
        label: "Third-Party / Vendor Name(s)",
        type: "text",
        prefillsGate: "TPR",
      },
      {
        id: "coupaOnboarded",
        label: "Has this vendor been onboarded through Procurement (Coupa)?",
        type: "select",
        options: ["Yes", "No", "I'm not sure"],
        conditional: { visibleWhen: "vendorNames", hasValue: true },
        revealNote: "Shown because vendor name(s) were entered.",
        help: "If you don't have visibility into procurement, say so — a reviewer will check.",
      },
      {
        id: "coupaUnsure",
        label: "We'll check with Procurement",
        type: "note",
        conditional: {
          visibleWhen: "coupaOnboarded",
          equalsAny: ["I'm not sure"],
        },
        body: "That's the right answer if you don't know — a reviewer confirms this with Procurement rather than asking you to chase it.",
      },
    ],
  },
  {
    name: "Compliance & Data",
    fields: [
      {
        id: "dataClassification",
        label: "Data Classification",
        type: "multi",
        options: ["Public", "Internal", "Confidential", "Restricted"],
        required: true,
        prefillsGate: "DMP",
      },
      {
        id: "dataElements",
        label: "Data Elements",
        type: "multi",
        options: [
          "None / Unknown",
          "Customer personal information",
          "Employee personal information",
          "Applicant personal information",
          "Partner/Vendor contact personal information",
        ],
        conditional: {
          visibleWhen: "dataClassification",
          includesAny: ["Internal", "Confidential", "Restricted"],
        },
        revealNote:
          "Shown because Internal, Confidential, or Restricted data was selected.",
        help: "High level only — the detailed data questions come later, and only if they apply.",
      },
    ],
  },
];

/** The one intake visibility rule: positive evidence only (SPEC §3.2.1). */
export function isFieldVisible(
  field: IntakeField,
  values: IntakeValues,
): boolean {
  if (!field.conditional) return true;
  const condition = field.conditional;
  const v = values[condition.visibleWhen];
  if ("hasValue" in condition) {
    return Array.isArray(v)
      ? v.length > 0
      : typeof v === "string" && v.trim().length > 0;
  }
  if ("equalsAny" in condition) {
    return typeof v === "string" && condition.equalsAny.includes(v);
  }
  const selected = Array.isArray(v) ? v : [];
  return condition.includesAny.some((o) => selected.includes(o));
}

export const ALL_FIELDS: IntakeField[] = INTAKE_SECTIONS.flatMap(
  (s) => s.fields,
);

/** Required fields currently visible — the completeness meter's basis. */
export function missingRequired(values: IntakeValues): string[] {
  return ALL_FIELDS.filter(
    (f) =>
      f.required &&
      isFieldVisible(f, values) &&
      (Array.isArray(values[f.id])
        ? (values[f.id] as string[]).length === 0
        : !(values[f.id] as string | undefined)?.trim()),
  ).map((f) => f.label);
}
