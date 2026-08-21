/**
 * The pure intake logic (SPEC §26.1) — no database, no framework, no
 * environment. These are the tests that will run unchanged as a CodeBuild
 * step, and the reason the same logic can move into a Lambda handler.
 */
import { describe, expect, it } from "vitest";
import {
  intakeChanges,
  SCOPE_KEY,
  intakePatchFrom,
  intakeValuesFrom,
  projectNameOrNull,
} from "../../src/lib/intake-values";

describe("intakePatchFrom (pure)", () => {
  it("stores a blank date as null, never an empty string", () => {
    expect(intakePatchFrom({ targetGoLive: [""] }).targetGoLive).toBeNull();
    expect(intakePatchFrom({ targetGoLive: ["2026-11-02"] }).targetGoLive).toBe("2026-11-02");
  });

  it("writes ONLY what the submission is responsible for (G-28)", () => {
    // This test previously asserted the opposite and pinned a data-loss
    // defect as correct: a submission covering one section wrote [] over
    // every multi-select in every other section. Independent verification
    // found it; the suite could not, because the suite encoded the bug.
    const savingOwnershipOnly = intakePatchFrom({
      [SCOPE_KEY]: ["businessOwner", "technicalOwner", "collaborators", "initiativeType"],
      businessOwner: ["P. Sharma"],
    });
    expect(savingOwnershipOnly.businessOwner).toBe("P. Sharma");
    expect(savingOwnershipOnly).not.toHaveProperty("dataClassification");
    expect(savingOwnershipOnly).not.toHaveProperty("dataElements");
  });

  it("inside its own scope, clearing a multi-select still persists", () => {
    const cleared = intakePatchFrom({
      [SCOPE_KEY]: ["dataClassification", "dataElements"],
      dataClassification: ["Internal"],
    });
    // dataElements is in scope and was submitted empty: that is a real
    // clearing and must be written, not skipped.
    expect(cleared.dataElements).toEqual([]);
    expect(cleared.dataClassification).toEqual("Internal");
  });

  it("with no declared scope, still refuses to clear what it was not given (N8)", () => {
    // The scope-less path is the one a future caller will reach for without
    // thinking. It must not be the dangerous one: writing [] over every
    // unmentioned multi-select is what erased whole sections (G-28).
    const everything = intakePatchFrom({ dataClassification: ["Internal"] });
    expect(everything.dataClassification).toEqual("Internal");
    expect(everything).not.toHaveProperty("dataElements");
  });

  it("never stores notes — they ask nothing and hold nothing", () => {
    const patch = intakePatchFrom({ usesAiUnsure: ["anything"], usesAi: ["I'm not sure"] });
    expect(patch).not.toHaveProperty("usesAiUnsure");
    expect(patch.usesAi).toBe("I'm not sure");
  });

  it("refuses to blank out the project's name", () => {
    expect(intakePatchFrom({ projectName: ["   "] })).not.toHaveProperty("projectName");
    expect(intakePatchFrom({ projectName: ["Cadenza"] }).projectName).toBe("Cadenza");
  });

  it("ignores fields the submitter never sent, rather than clearing them", () => {
    expect(intakePatchFrom({})).not.toHaveProperty("businessOwner");
  });
});

describe("projectNameOrNull (pure)", () => {
  it("trims, and rejects anything that cannot serve as a name", () => {
    expect(projectNameOrNull("  Cadenza  ")).toBe("Cadenza");
    expect(projectNameOrNull("   ")).toBeNull();
    expect(projectNameOrNull(undefined)).toBeNull();
  });
});

describe("intakeValuesFrom (pure)", () => {
  it("presents nulls as empty strings and preserves arrays", () => {
    const values = intakeValuesFrom({
      projectName: "Cadenza",
      targetGoLive: null,
      dataClassification: "Internal",
    });
    expect(values.projectName).toBe("Cadenza");
    expect(values.targetGoLive).toBe("");
    expect(values.dataClassification).toEqual("Internal");
  });
});

describe("what changed, and what it was before (F5)", () => {
  it("records only fields that actually moved", () => {
    const before = { projectName: "Cadenza", businessOwner: "P. Sharma" };
    const changes = intakeChanges(before, {
      projectName: "Cadenza",
      businessOwner: "N. Kahan",
    });
    expect(changes).toEqual([
      { fieldId: "businessOwner", previousValue: "P. Sharma", value: "N. Kahan" },
    ]);
  });

  it("keeps the list a multi-select used to hold, not a flattened string", () => {
    const changes = intakeChanges(
      { dataClassification: ["Internal", "Confidential"] },
      { dataClassification: ["Internal"] },
    );
    expect(changes[0]!.previousValue).toEqual(["Internal", "Confidential"]);
    expect(changes[0]!.value).toEqual(["Internal"]);
  });

  it("treats an absent previous value and an empty one as the same non-event", () => {
    expect(intakeChanges({}, { businessOwner: "" })).toEqual([]);
    expect(intakeChanges({ dataElements: [] }, { dataElements: [] })).toEqual([]);
  });

  it("records clearing a field as a change, with what was lost", () => {
    const changes = intakeChanges({ targetGoLive: "2026-11-02" }, { targetGoLive: null });
    expect(changes).toEqual([
      { fieldId: "targetGoLive", previousValue: "2026-11-02", value: null },
    ]);
  });
});
