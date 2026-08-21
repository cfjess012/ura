/**
 * The intake instrument as DATA (SPEC §3.1, FR-1) — four ordered sections,
 * conditional fields included, transcribed from the accepted reference
 * design. Components render this; no question content lives in components.
 *
 * Field ids are internal; only labels reach the user (NFR-9).
 */

export type IntakeCondition =
  | { visibleWhen: string; hasValue: true }
  | { visibleWhen: string; includesAny: string[] };

export type IntakeField = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "multi";
  required?: boolean;
  options?: string[];
  conditional?: IntakeCondition;
  /** Plain-language reason shown when a conditional field reveals. */
  revealNote?: string;
};

export type IntakeSection = { name: string; fields: IntakeField[] };

export type IntakeValues = Record<string, string | string[]>;

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
      },
      {
        id: "techNonTech",
        label: "Technology / Non-Technology",
        type: "select",
        options: ["Technology", "Non-Technology"],
        required: true,
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
        id: "relatedAssessments",
        label: "Related / Prior Assessments (ARA, ISR, PIA, DPIA, AVA)",
        type: "text",
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
        id: "priority",
        label: "Priority",
        type: "select",
        options: ["Critical", "High", "Medium", "Low"],
        required: true,
      },
      {
        id: "lifecycleStage",
        label: "Lifecycle Stage",
        type: "select",
        options: [
          "Backlog",
          "Ideation",
          "In Development",
          "POC",
          "In Production",
          "Cancelled",
        ],
        required: true,
      },
      {
        id: "vendorNames",
        label: "Third-Party / Vendor Name(s)",
        type: "text",
      },
      {
        id: "vendorNotInCoupa",
        label: "Third Parties Not in Coupa",
        type: "text",
        conditional: { visibleWhen: "vendorNames", hasValue: true },
        revealNote: "Shown because vendor name(s) were entered.",
      },
    ],
  },
  {
    name: "Compliance & Data",
    fields: [
      {
        id: "complianceAreas",
        label: "Compliance Obligation Areas",
        type: "multi",
        options: [
          "Consumer protection/fair treatment",
          "Financial crimes",
          "InfoSec/cyber",
          "Privacy/data protection",
          "Records retention/eDiscovery",
          "Accessibility",
          "Marketing/advertising/comms",
          "Third-party/outsourcing",
          "Model/analytics governance",
          "Employment/workforce",
          "Other",
          "Unknown",
        ],
      },
      {
        id: "dataClassification",
        label: "Data Classification",
        type: "multi",
        options: ["Public", "Internal", "Confidential", "Restricted"],
        required: true,
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
      },
      {
        id: "piiTypes",
        label: "PII Type Details",
        type: "multi",
        options: [
          "Name, address, phone, email",
          "Government ID (SSN, DL, passport)",
          "Account / policy numbers",
          "Financial information",
          "Authentication credentials",
          "Device / online identifiers",
          "Biometric",
          "Geolocation",
          "Health information",
          "Background check / employment",
          "Communications content",
          "Children's data",
          "Other",
        ],
        conditional: {
          visibleWhen: "dataClassification",
          includesAny: ["Internal", "Confidential", "Restricted"],
        },
        revealNote:
          "Shown because Internal, Confidential, or Restricted data was selected.",
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
  const v = values[field.conditional.visibleWhen];
  if ("hasValue" in field.conditional) {
    return Array.isArray(v)
      ? v.length > 0
      : typeof v === "string" && v.trim().length > 0;
  }
  const selected = Array.isArray(v) ? v : [];
  return field.conditional.includesAny.some((o) => selected.includes(o));
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
