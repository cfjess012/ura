/**
 * S1 acceptance — intake visibility rules (FR-1) and completeness.
 * Positive evidence only: emptiness never reveals (SPEC §3.2.1).
 */
import { describe, expect, it } from "vitest";
import {
  ALL_FIELDS,
  INTAKE_SECTIONS,
  isFieldVisible,
  missingRequired,
} from "../../src/lib/intake";

const byId = (id: string) => ALL_FIELDS.find((f) => f.id === id)!;

describe("intake structure (FR-1)", () => {
  it("has the four ordered sections from the reference design", () => {
    expect(INTAKE_SECTIONS.map((s) => s.name)).toEqual([
      "Description",
      "Ownership",
      "Categorization",
      "Compliance & Data",
    ]);
  });

  it("pins the exact field set — no field is added or dropped silently", () => {
    // This test exists because a rewrite silently dropped a field once.
    // Changing the instrument is a deliberate act: update this list with it.
    const ids = INTAKE_SECTIONS.map((s) => [s.name, s.fields.map((f) => f.id)]);
    expect(ids).toEqual([
      ["Description", ["projectName", "businessPurpose", "projectDescription", "usesAi", "aiUseCase", "usesAiUnsure"]],
      ["Ownership", ["businessOwner", "technicalOwner", "collaborators", "initiativeType", "priorAssessmentRef"]],
      ["Categorization", ["businessUnit", "otherUnits", "targetGoLive", "vendorNames", "coupaOnboarded", "coupaUnsure"]],
      ["Compliance & Data", ["dataClassification", "dataElements"]],
    ]);
  });

  it("no GRC acronym soup or internal ids in any user-facing string (NFR-9)", () => {
    const surfaces = ALL_FIELDS.flatMap((f) => [f.label, f.help ?? "", f.revealNote ?? ""]);
    for (const text of surfaces) {
      expect(text).not.toMatch(/\b(ARA|BIR|PIA|DPIA|AVA)\b/); // plain English asks
      expect(text).not.toMatch(/[a-z]+\.[a-z_]+/); // dotted identifiers
    }
  });

  it("offers an honest-uncertainty option wherever visibility may be missing (FR-23)", () => {
    for (const id of ["usesAi", "coupaOnboarded"]) {
      const field = byId(id);
      expect(field.options, id).toContain("I'm not sure");
    }
    // A launch date is optional on purpose — blank beats a manufactured date.
    expect(byId("targetGoLive").required).toBeUndefined();
  });

  it("every conditional field carries a plain-language reveal reason (NFR-9/§9)", () => {
    for (const f of ALL_FIELDS.filter((f) => f.conditional && f.type !== "note")) {
      expect(f.revealNote, f.id).toBeTruthy();
      expect(f.revealNote).not.toMatch(/C-\d/); // no instrument codes in user-facing text
    }
  });
});

describe("conditional visibility (FR-1)", () => {
  it("equalsAny conditions fire only on the listed answers", () => {
    const ai = byId("aiUseCase");
    expect(isFieldVisible(ai, {})).toBe(false);
    expect(isFieldVisible(ai, { usesAi: "No" })).toBe(false);
    expect(isFieldVisible(ai, { usesAi: "Yes" })).toBe(true);
    const prior = byId("priorAssessmentRef");
    expect(isFieldVisible(prior, { initiativeType: "Brand new" })).toBe(false);
    expect(isFieldVisible(prior, { initiativeType: "A vendor renewal" })).toBe(true);
  });

  it("never re-asks what the person just said they don't know (§24.1)", () => {
    // "I'm not sure" must NOT demand a description of the thing they don't
    // know. It shows a reassurance instead, and the system routes it.
    const detail = byId("aiUseCase");
    const reassurance = byId("usesAiUnsure");
    expect(isFieldVisible(detail, { usesAi: "I'm not sure" })).toBe(false);
    expect(isFieldVisible(reassurance, { usesAi: "I'm not sure" })).toBe(true);
    expect(isFieldVisible(reassurance, { usesAi: "Yes" })).toBe(false);
    expect(reassurance.type).toBe("note");
    expect(reassurance.body).toMatch(/Risk Assessor will confirm/);
    // Same courtesy on procurement.
    expect(isFieldVisible(byId("coupaUnsure"), { coupaOnboarded: "I'm not sure" })).toBe(true);
  });

  it("notes ask nothing: no required notes, and every note has a body (§24.1)", () => {
    for (const f of ALL_FIELDS.filter((f) => f.type === "note")) {
      expect(f.required, f.id).toBeUndefined();
      expect(f.body, f.id).toBeTruthy();
      expect(f.options, f.id).toBeUndefined();
    }
  });

  it("hasValue conditions need a non-blank trigger", () => {
    const other = byId("otherUnits");
    expect(isFieldVisible(other, {})).toBe(false);
    expect(isFieldVisible(other, { businessUnit: "   " })).toBe(false);
    expect(isFieldVisible(other, { businessUnit: "Workforce Ops" })).toBe(true);
    const coupa = byId("coupaOnboarded");
    expect(isFieldVisible(coupa, { vendorNames: "" })).toBe(false);
    expect(isFieldVisible(coupa, { vendorNames: "Cadenza Inc" })).toBe(true);
  });

  it("includesAny conditions need an actual selection", () => {
    const elements = byId("dataElements");
    expect(isFieldVisible(elements, {})).toBe(false);
    expect(isFieldVisible(elements, { dataClassification: ["Public"] })).toBe(
      false,
    );
    expect(
      isFieldVisible(elements, { dataClassification: ["Confidential"] }),
    ).toBe(true);
    expect(
      isFieldVisible(elements, { dataClassification: ["Public", "Internal"] }),
    ).toBe(true);
  });
});

describe("completeness meter", () => {
  it("counts only visible required fields", () => {
    const missing = missingRequired({});
    expect(missing).toContain("Project Name");
    expect(missing).toContain("Data Classification");
    expect(missing).toContain("Does this use AI or machine learning?");
    // Conditional fields are optional AND hidden — never counted.
    expect(missing).not.toContain("Other Business Units Involved");
  });

  it("empties when every visible required field is answered", () => {
    const done = missingRequired({
      projectName: "P",
      businessPurpose: "B",
      projectDescription: "D",
      usesAi: "No",
      businessOwner: "O",
      initiativeType: "Brand new",
      businessUnit: "U",
      dataClassification: ["Internal"],
    });
    expect(done).toEqual([]);
  });
});

describe("helper text (§24.6 — the system absorbs complexity)", () => {
  // A person should never have to guess what a question means. Only a field
  // whose label is self-evident may go without help.
  const SELF_EVIDENT = new Set(["projectName", "projectDescription"]);

  it("every question a person answers carries helper text", () => {
    const bare = ALL_FIELDS.filter(
      (f) => f.type !== "note" && !SELF_EVIDENT.has(f.id) && !f.help?.trim(),
    ).map((f) => f.label);
    expect(bare).toEqual([]);
  });

  it("helper text teaches rather than restates the label", () => {
    for (const f of ALL_FIELDS.filter((f) => f.help)) {
      expect(f.help!.length, f.id).toBeGreaterThan(30);
      expect(f.help!.toLowerCase(), f.id).not.toBe(f.label.toLowerCase());
    }
  });

  it("tells people what to do when something does not apply to them", () => {
    // The vendor field is the case that prompted this: an in-house build
    // left a person staring at an empty box with no way to say "none".
    expect(ALL_FIELDS.find((f) => f.id === "vendorNames")!.help).toMatch(/in-house/i);
  });
});

describe("questions say what to do when they don't apply (§24.1)", () => {
  // The case that prompted this rule: someone building entirely in-house
  // stared at an empty "Third-Party / Vendor Name(s)" box with no way to
  // say "none". An optional free-text question must tell them.
  it("every optional free-text field says what 'not applicable' looks like", () => {
    const silent = ALL_FIELDS.filter(
      (f) => (f.type === "text" || f.type === "textarea") && !f.required,
    )
      .filter((f) => !/leave blank|if that|if it|if there|if you don't|not applicable|none/i.test(f.help ?? ""))
      .map((f) => f.label);
    expect(silent).toEqual([]);
  });
});
