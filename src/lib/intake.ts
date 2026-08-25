/**
 * The intake instrument as DATA (SPEC §3.1, FR-1) — ordered sections with
 * conditional fields, transcribed from the accepted reference design and
 * refined in the S1 review (2026-08-21).
 *
 * Design rules this file obeys:
 * - Plain language only; no GRC acronyms as the primary ask, no internal
 *   identifiers (NFR-9). Field ids are internal and never rendered.
 * - Nothing here is asked twice at Tier 1: a field that duplicates a gate
 *   pre-answers it visibly and changeably (FR-22). The rules that do that
 *   live in the instrument seed, so there is one statement of the mapping.
 * - "Unknown" is a legitimate answer wherever a requester may genuinely
 *   lack visibility (FR-23) — the front door never manufactures certainty.
 */

import { matches, type Condition } from "./conditions";

/** Intake names its trigger `visibleWhen`; the rules are the shared ones,
 *  evaluated by the single predicate in conditions.ts (NFR-2). */
export type IntakeCondition =
  | { visibleWhen: string; hasValue: true }
  | { visibleWhen: string; equalsAny: string[] }
  | { visibleWhen: string; includesAny: string[] };

export type IntakeField = {
  id: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "select"
    | "choice"
    | "multi"
    | "date"
    | "note"
    /** One name chosen from a reference list, or one typed off-list. */
    | "pick"
    /** Several names from a reference list, plus any typed off-list. */
    | "pick-many";
  /**
   * Which list a `pick` offers (FR-29). A slug from `reference.ts`, or
   * `"people"` for the employee directory — which is operational rather
   * than versioned, because a real deployment resolves it from an IdP
   * rather than a file (G-46's deliberate exception).
   *
   * Named here, in the instrument, so no component ever holds a list of
   * names. That is the specific laziness S4.5 exists to avoid.
   */
  list?: string;
  required?: boolean;
  options?: string[];
  /**
   * One line per option, shown beside it. A "choice" field asks a person to
   * place their situation on a scale, and a scale whose rungs are single
   * words ("Confidential") is a vocabulary test — the descriptions are what
   * make the answer comparable between two people (§24.7).
   */
  optionHelp?: Record<string, string>;
  help?: string;
  /**
   * The specific things worth naming here, listed under the help line.
   *
   * These exist because the coherence check grades this text against a
   * published rubric, and a person cannot hit a standard nobody showed
   * them. Each point is one of the things the rubric looks for, said in
   * plain words — so the guidance and the grading cannot drift apart.
   */
  helpPoints?: Array<{ ask: string; more: string }>;
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
      // One description, not two. "Business Purpose or Objective" and
      // "Activity / Use-Case Description" asked for overlapping things in
      // adjacent boxes, and people answered by pasting the same paragraph
      // into both — every seeded assessment had them identical. Two boxes
      // holding one answer is worse than one box: it doubles the work and
      // then reads as a contradiction to anything comparing them.
      {
        id: "projectDescription",
        label: "Project Description",
        type: "textarea",
        required: true,
        help: "What this is, why the organisation wants it, and how it works — in plain terms. This is the answer the AI check reads most closely.",
        // Written for somebody who does not work in risk. The old version
        // said "what the system decides or produces on its own" and "any
        // supplier, external API, or system outside your team" — accurate,
        // and the vocabulary of the people who wrote the rubric rather than
        // the people filling in the form. A question they can answer beats
        // a specification of the answer.
        helpPoints: [
          {
            ask: "What is it?",
            more: "What the thing does, in the words you would use telling a colleague about it.",
          },
          {
            ask: "Why now?",
            more: "What happens today that this changes, and who is better off for it.",
          },
          {
            ask: "Who uses it?",
            more: "Who works with it day to day — and who is affected by what it produces, even if they never open it.",
          },
          {
            ask: "Who decides?",
            more: "What it works out by itself, and where a person still looks at it and says yes or no.",
          },
          {
            ask: "What information?",
            more: "What it reads or creates. Say plainly if any of it is about people, or is money, health or anything you would not email around.",
          },
          {
            ask: "Where does it go?",
            more: "Anyone outside your team who sees it — a supplier, another system, a tool you signed up for — and where it ends up.",
          },
          {
            ask: "How many people?",
            more: "A handful to start with, one team, or everybody.",
          },
        ],
      },
      {
        id: "usesAi",
        label: "Does this use AI or machine learning?",
        type: "select",
        options: ["Yes", "No", "I'm not sure"],
        required: true,
        help: "Includes AI features inside a vendor's product, not just models you build.",
      },
      {
        id: "aiUseCase",
        label: "What does the AI do?",
        type: "textarea",
        conditional: { visibleWhen: "usesAi", equalsAny: ["Yes"] },
        revealNote:
          "Shown because you told us this uses AI or machine learning.",
        help: "What it decides or produces, what data it uses, and how much a person reviews before anything happens. If you don't know the details, say what you do know — a reviewer will follow up.",
        helpPoints: [
          {
            ask: "Whose AI is it?",
            more: "The name of the tool or model doing the work, and whether it is yours or somebody else's.",
          },
          {
            ask: "What goes in and out?",
            more: "What you give it, and what it gives back.",
          },
          {
            ask: "Who checks it?",
            more: "Whether a person looks at what it produces before anything happens — and say so if nobody does.",
          },
        ],
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
        help: "The person accountable for this activity — usually whoever owns the budget or the outcome. Start typing to find them.",
        type: "pick",
        list: "people",
        required: true,
      },
      {
        id: "technicalOwner",
        label: "Technical Owner",
        type: "pick",
        list: "people",
        help: "Whoever builds or runs it, if that's someone else. Leave blank if it's the same person, or if there's nothing technical.",
      },
      {
        id: "collaborators",
        label: "Collaborators",
        type: "text",
        help: "Anyone else who should be able to see this assessment or answer questions about it. Leave blank if it's just you.",
      },
      {
        id: "initiativeType",
        label: "Is this a new initiative, or an update to an existing one?",
        help: "It helps reviewers know whether there is prior work to look at, or whether this starts from nothing.",
        type: "select",
        options: ["Brand new", ...UPDATE_TYPES, "Something else"],
        required: true,
      },
      {
        id: "priorAssessmentRef",
        // Reworded on owner feedback (item 1). The old wording asked what the
        // activity builds on; a reviewer actually wants to know what work has
        // already been assessed, and naming the real artifacts is what tells
        // someone which drawer to look in.
        label: "What has already been assessed?",
        type: "textarea",
        conditional: { visibleWhen: "initiativeType", equalsAny: UPDATE_TYPES },
        revealNote:
          "Shown because this builds on existing work — it helps reviewers find the prior file.",
        help: "Anything that points a reviewer at the prior work — a Risk Assessment number, an Architectural Risk Assessment (ARA-100), a Privacy Impact Assessment (PIA), a ticket, or a link. More than one is fine, and you can attach the documents below. Leave it blank if you don't know of any.",
      },
    ],
  },
  {
    name: "Categorization",
    fields: [
      {
        id: "businessUnit",
        label: "Responsible Business Unit",
        type: "pick",
        list: "business-units",
        required: true,
        help: "The team or department that owns this activity — the one accountable if it goes wrong, not necessarily the one building it.",
      },
      {
        id: "otherUnits",
        label: "Other Business Units Involved",
        help: "Teams outside your own who use it, depend on it, or share the data. Leave blank if it's only your team.",
        type: "pick-many",
        list: "business-units",
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
        id: "thirdPartyInvolved",
        label: "Does anything about this involve a company outside ours?",
        type: "select",
        options: ["Yes", "No", "I'm not sure"],
        required: true,
        help: "A software subscription (SaaS), a cloud provider, a consultancy, an outsourced team — anyone outside the company doing part of the work, including a renewal of something you already use. Answer No if everything is built and run in-house.",
      },
      {
        id: "thirdPartyUnsure",
        label: "We'll find out for you",
        type: "note",
        conditional: {
          visibleWhen: "thirdPartyInvolved",
          equalsAny: ["I'm not sure"],
        },
        body: "That's a fine answer. We'll treat third-party risk as in scope for now, and a reviewer confirms it rather than asking you to go and check.",
      },
      {
        id: "vendorNames",
        label: "Which companies?",
        type: "pick-many",
        list: "vendors",
        conditional: {
          visibleWhen: "thirdPartyInvolved",
          equalsAny: ["Yes"],
        },
        revealNote: "Shown because an outside company is involved.",
        help: "Pick the ones you know. If a company isn't listed, add it — it goes on your assessment straight away, and reaches everyone else's list once an administrator confirms it.",
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
        label: "What's the most sensitive data involved?",
        help: "Count everything the activity touches, including copies in logs, exports and backups. If you're between two, choose the higher one — a reviewer confirms it.",
        type: "choice",
        options: ["Public", "Internal", "Confidential", "Restricted"],
        optionHelp: {
          Public:
            "Already cleared for release outside the company — published pages, public reports.",
          Internal:
            "Everyday company information. Not secret, but not for outside eyes.",
          Confidential:
            "Would cause real harm if it got out — personal details, contracts, financials.",
          Restricted:
            "The most sensitive we hold — payment or health data, credentials, anything under a legal lock.",
        },
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
          equalsAny: ["Internal", "Confidential", "Restricted"],
        },
        revealNote: "Shown because the data is not public.",
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

/**
 * Required fields that are visible and unanswered, as field ids rather than
 * labels — so a screen can point at the control, not just name it.
 */
export function missingRequiredFields(values: IntakeValues): IntakeField[] {
  return ALL_FIELDS.filter(
    (f) =>
      f.required &&
      isFieldVisible(f, values) &&
      (Array.isArray(values[f.id])
        ? (values[f.id] as string[]).length === 0
        : !(values[f.id] as string | undefined)?.trim()),
  );
}

/**
 * Whether the identity record is complete enough to work from (FR-28).
 *
 * Intake is not a form to survive; it is what every later tier reasons
 * from. An empty record reaches Tier 1 with nothing pre-answered, so the
 * person is asked everything and the platform's whole claim — that it does
 * not ask twice — silently stops being true. Partial saves stay allowed;
 * what is refused is treating an unfinished record as finished.
 */
export function intakeIsComplete(values: IntakeValues): boolean {
  return missingRequiredFields(values).length === 0;
}

/** The section a person must return to, or null when nothing is missing. */
export function firstIncompleteSection(values: IntakeValues): string | null {
  const missing = new Set(missingRequiredFields(values).map((f) => f.id));
  if (missing.size === 0) return null;
  const section = INTAKE_SECTIONS.find((s) =>
    s.fields.some((f) => missing.has(f.id)),
  );
  return section ? sectionKey(section.name) : null;
}

/** URL-safe key for a section, so each one can be its own screen (§24.2). */
export function sectionKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const SECTION_KEYS = INTAKE_SECTIONS.map((s) => sectionKey(s.name));

export function sectionByKey(key: string): IntakeSection | undefined {
  return INTAKE_SECTIONS.find((s) => sectionKey(s.name) === key);
}

export type SectionProgress = {
  key: string;
  name: string;
  /** Required, visible, still unanswered — what this section owes. */
  missing: string[];
  answered: number;
  visible: number;
};

/** Per-section progress for the rail — counted on what the person can act on (§24.8). */
export function sectionProgress(values: IntakeValues): SectionProgress[] {
  return INTAKE_SECTIONS.map((section) => {
    const visible = section.fields.filter(
      (f) => f.type !== "note" && isFieldVisible(f, values),
    );
    const held = (f: IntakeField) => {
      const v = values[f.id];
      return Array.isArray(v)
        ? v.length > 0
        : Boolean((v as string | undefined)?.trim());
    };
    return {
      key: sectionKey(section.name),
      name: section.name,
      missing: visible
        .filter((f) => f.required && !held(f))
        .map((f) => f.label),
      answered: visible.filter(held).length,
      visible: visible.length,
    };
  });
}

/** Which section owns a field, by its URL key. Null if nothing does. */
export function sectionKeyOwning(fieldId: string): string | null {
  for (const section of INTAKE_SECTIONS) {
    if (section.fields.some((f) => f.id === fieldId)) {
      return sectionKey(section.name);
    }
  }
  return null;
}

/**
 * The intake as one readable document.
 *
 * Two modes, and the difference is not cosmetic.
 *
 * `"named"` prints `(not answered)` for a blank. **Grading needs that**: an
 * intake that answered everything thinly reads differently from one that
 * left half of it empty, and "nothing here says who touches the data" is a
 * different finding from "they were never asked".
 *
 * `"omitted"` leaves blanks out entirely, and **drafting needs that**: a
 * proposal quotes its source verbatim back to the person, so every sentence
 * in the source has to be one they wrote. `(not answered)` is our text, and
 * a proposal grounded in our own placeholder would be the platform quoting
 * itself as evidence.
 *
 * Only visible fields are rendered either way, so a quote can never come
 * from a question they were never asked.
 */
export function intakeAsDocument(
  values: IntakeValues,
  options?: { blanks?: "named" | "omitted" },
): string {
  const blanks = options?.blanks ?? "named";
  const lines: string[] = [];
  for (const section of INTAKE_SECTIONS) {
    for (const field of section.fields) {
      if (field.type === "note") continue;
      if (!isFieldVisible(field, values)) continue;
      const value = values[field.id];
      const text =
        value === undefined || value === null || value === ""
          ? ""
          : Array.isArray(value)
            ? value.join(", ")
            : String(value);
      if (text === "") {
        if (blanks === "named") lines.push(`${field.label}: (not answered)`);
        continue;
      }
      lines.push(`${field.label}: ${text}`);
    }
  }
  return lines.join("\n");
}
