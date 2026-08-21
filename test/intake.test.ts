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
} from "../src/lib/intake";

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

  it("every conditional field carries a plain-language reveal reason (NFR-9/§9)", () => {
    for (const f of ALL_FIELDS.filter((f) => f.conditional)) {
      expect(f.revealNote, f.id).toBeTruthy();
      expect(f.revealNote).not.toMatch(/C-\d/); // no instrument codes in user-facing text
    }
  });
});

describe("conditional visibility (FR-1)", () => {
  it("hasValue conditions need a non-blank trigger", () => {
    const other = byId("otherUnits");
    expect(isFieldVisible(other, {})).toBe(false);
    expect(isFieldVisible(other, { businessUnit: "   " })).toBe(false);
    expect(isFieldVisible(other, { businessUnit: "Workforce Ops" })).toBe(true);
    const coupa = byId("vendorNotInCoupa");
    expect(isFieldVisible(coupa, { vendorNames: "" })).toBe(false);
    expect(isFieldVisible(coupa, { vendorNames: "Cadenza Inc" })).toBe(true);
  });

  it("includesAny conditions need an actual selection", () => {
    const elements = byId("dataElements");
    const pii = byId("piiTypes");
    expect(isFieldVisible(elements, {})).toBe(false);
    expect(isFieldVisible(elements, { dataClassification: ["Public"] })).toBe(
      false,
    );
    expect(
      isFieldVisible(elements, { dataClassification: ["Confidential"] }),
    ).toBe(true);
    expect(
      isFieldVisible(pii, { dataClassification: ["Public", "Internal"] }),
    ).toBe(true);
  });
});

describe("completeness meter", () => {
  it("counts only visible required fields", () => {
    const missing = missingRequired({});
    expect(missing).toContain("Project Name");
    expect(missing).toContain("Data Classification");
    // Conditional fields are optional AND hidden — never counted.
    expect(missing).not.toContain("Other Business Units Involved");
  });

  it("empties when the nine required fields are answered", () => {
    const done = missingRequired({
      projectName: "P",
      businessPurpose: "B",
      projectDescription: "D",
      techNonTech: "Technology",
      businessOwner: "O",
      businessUnit: "U",
      priority: "High",
      lifecycleStage: "POC",
      dataClassification: ["Internal"],
    });
    expect(done).toEqual([]);
  });
});
