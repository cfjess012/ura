/**
 * S1 acceptance — intake visibility rules (FR-1) and completeness.
 * Positive evidence only: emptiness never reveals (SPEC §3.2.1).
 */
import { describe, expect, it } from "vitest";
import {
  intakeIsComplete,
  firstIncompleteSection,
  missingRequiredFields,
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
      [
        "Description",
        [
          "projectName",
          "businessPurpose",
          "projectDescription",
          "usesAi",
          "aiUseCase",
          "usesAiUnsure",
        ],
      ],
      [
        "Ownership",
        [
          "businessOwner",
          "technicalOwner",
          "collaborators",
          "initiativeType",
          "priorAssessmentRef",
        ],
      ],
      [
        "Categorization",
        [
          "businessUnit",
          "otherUnits",
          "targetGoLive",
          "thirdPartyInvolved",
          "thirdPartyUnsure",
          "vendorNames",
          "coupaOnboarded",
          "coupaUnsure",
        ],
      ],
      ["Compliance & Data", ["dataClassification", "dataElements"]],
    ]);
  });

  /**
   * An acronym may name a document a person is holding, but it may never
   * arrive unexplained (NFR-9, §24.7).
   *
   * The rule used to ban ARA / PIA / DPIA outright, and the owner asked for
   * exactly those words — because they are what their people call the
   * documents, and "the prior assessment" sends someone hunting while
   * "ARA-100" sends them to the right drawer. Banning them outright was the
   * wrong shape of protection: the harm is not the letters, it is a
   * vocabulary test. So the rule became "spell it out at first use", which
   * keeps the acronym useful to the person who knows it and teaches the
   * person who does not.
   */
  const SPELLED_OUT: Record<string, RegExp> = {
    ARA: /Architectural Risk Assessment/i,
    PIA: /Privacy Impact Assessment/i,
    DPIA: /Data Protection Impact Assessment/i,
    BIR: /Business Impact Review/i,
    AVA: /Application Vulnerability Assessment/i,
  };

  it("an acronym a person reads is spelled out where it appears (NFR-9)", () => {
    const surfaces = ALL_FIELDS.flatMap((f) => [
      f.label,
      f.help ?? "",
      f.revealNote ?? "",
    ]);
    for (const text of surfaces) {
      for (const [acronym, expansion] of Object.entries(SPELLED_OUT)) {
        if (new RegExp(`\\b${acronym}\\b`).test(text)) {
          expect(text, `${acronym} appears without being spelled out`).toMatch(
            expansion,
          );
        }
      }
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
    for (const f of ALL_FIELDS.filter(
      (f) => f.conditional && f.type !== "note",
    )) {
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
    expect(isFieldVisible(prior, { initiativeType: "A vendor renewal" })).toBe(
      true,
    );
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
    expect(
      isFieldVisible(byId("coupaUnsure"), { coupaOnboarded: "I'm not sure" }),
    ).toBe(true);
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
    expect(isFieldVisible(elements, { dataClassification: "Public" })).toBe(
      false,
    );
    expect(
      isFieldVisible(elements, { dataClassification: "Confidential" }),
    ).toBe(true);
    expect(isFieldVisible(elements, { dataClassification: "Internal" })).toBe(
      true,
    );
  });
});

describe("completeness meter", () => {
  it("counts only visible required fields", () => {
    const missing = missingRequired({});
    expect(missing).toContain("Project Name");
    expect(missing).toContain("What's the most sensitive data involved?");
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
      thirdPartyInvolved: "No",
      dataClassification: "Internal",
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
    // It is now answered structurally rather than by helper text — there is
    // an explicit way to say no, and the name box never appears if you do
    // (audit C-2). Helper text explaining a blank is the weaker fix; this
    // test pins the stronger one.
    const gateQuestion = ALL_FIELDS.find((f) => f.id === "thirdPartyInvolved")!;
    expect(gateQuestion.options).toContain("No");
    expect(gateQuestion.help).toMatch(/in-house/i);
    const names = ALL_FIELDS.find((f) => f.id === "vendorNames")!;
    expect(names.conditional).toEqual({
      visibleWhen: "thirdPartyInvolved",
      equalsAny: ["Yes"],
    });
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
      .filter(
        (f) =>
          !/leave blank|if that|if it|if there|if you don't|not applicable|none/i.test(
            f.help ?? "",
          ),
      )
      .map((f) => f.label);
    expect(silent).toEqual([]);
  });
});

describe("required means required (FR-28)", () => {
  // The defect: four clicks through intake answering nothing landed on the
  // risk areas with a completely empty identity record and no pre-fill —
  // so the platform asked all eleven gates and its claim not to ask twice
  // quietly stopped being true. `required: true` was decoration.
  it("an empty record is not complete, and names where to go back to", () => {
    expect(intakeIsComplete({})).toBe(false);
    expect(firstIncompleteSection({})).toBe("description");
  });

  it("walks forward through the sections as each is satisfied", () => {
    const values: Record<string, string | string[]> = {
      projectName: "P",
      businessPurpose: "B",
      projectDescription: "D",
      usesAi: "No",
    };
    expect(firstIncompleteSection(values)).toBe("ownership");
    values.businessOwner = "O";
    values.initiativeType = "Brand new";
    expect(firstIncompleteSection(values)).toBe("categorization");
    values.businessUnit = "U";
    values.thirdPartyInvolved = "No";
    expect(firstIncompleteSection(values)).toBe("compliance-data");
    values.dataClassification = "Public";
    expect(firstIncompleteSection(values)).toBeNull();
    expect(intakeIsComplete(values)).toBe(true);
  });

  it("counts a required field only while it is visible", () => {
    // A conditional field that is hidden cannot block anyone.
    const hidden = missingRequiredFields({ usesAi: "No" }).map((f) => f.id);
    expect(hidden).not.toContain("aiUseCase");
  });

  it("every required field can actually be answered — no unanswerable block", () => {
    // A required select with no honest escape traps anyone who does not
    // know (FR-23). Free text always has one; a select must offer it.
    for (const f of ALL_FIELDS.filter(
      (f) => f.required && f.type === "select",
    )) {
      expect(f.options, f.id).toBeTruthy();
      expect(f.options!.length, f.id).toBeGreaterThan(1);
    }
  });
});

/**
 * §22.1 · the guidance and the grading may not drift apart.
 *
 * The check grades this text against a published rubric, so the field has
 * to say what the rubric looks for. The help here used to read "one or two
 * sentences is plenty" — advice that actively loses marks on a rubric which
 * rewards naming the data, the users and the suppliers.
 */
describe("long-form fields say how to answer them well", () => {
  const longForm = ALL_FIELDS.filter(
    (f) => f.type === "textarea" && f.required,
  );

  it("has some", () => {
    expect(longForm.length).toBeGreaterThan(0);
  });

  it("gives every required long-form field points to hit", () => {
    for (const field of longForm) {
      expect(
        field.helpPoints?.length,
        `${field.id} has nothing telling a person what to include`,
      ).toBeGreaterThan(0);
    }
  });

  it("never caps the length of an answer the rubric grades on detail", () => {
    for (const field of ALL_FIELDS) {
      const said = [field.help ?? "", ...(field.helpPoints ?? [])].join(" ");
      expect(said, `${field.id} tells people to write less`).not.toMatch(
        /is plenty|keep it (short|brief)|no more than|a sentence or two/i,
      );
    }
  });

  it("points the main description at each thing the check grades", () => {
    const points = (
      ALL_FIELDS.find((f) => f.id === "projectDescription")?.helpPoints ?? []
    )
      .join(" ")
      .toLowerCase();
    // The four the rubric scores beyond plain clarity.
    expect(points).toMatch(/decides|produces/); // what it does vs a person
    expect(points).toMatch(/who uses it|affected/); // audience & scope
    expect(points).toMatch(/identifies a person|sensitive/); // sensitivity
    expect(points).toMatch(/supplier|external|outside/); // access & flow
  });
});
