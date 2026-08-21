/**
 * The pure intake logic (SPEC §26.1) — no database, no framework, no
 * environment. These are the tests that will run unchanged as a CodeBuild
 * step, and the reason the same logic can move into a Lambda handler.
 */
import { describe, expect, it } from "vitest";
import {
  intakePatchFrom,
  intakeValuesFrom,
  isTechnologyActivity,
  projectNameOrNull,
} from "../../src/lib/intake-values";

describe("intakePatchFrom (pure)", () => {
  it("stores a blank date as null, never an empty string", () => {
    expect(intakePatchFrom({ targetGoLive: [""] }).targetGoLive).toBeNull();
    expect(intakePatchFrom({ targetGoLive: ["2026-11-02"] }).targetGoLive).toBe("2026-11-02");
  });

  it("always writes multi-selects, so clearing one persists", () => {
    const cleared = intakePatchFrom({ businessOwner: ["P"] });
    expect(cleared.dataClassification).toEqual([]);
    expect(intakePatchFrom({ dataClassification: ["Internal", "Confidential"] }).dataClassification)
      .toEqual(["Internal", "Confidential"]);
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
      dataClassification: ["Internal"],
    });
    expect(values.projectName).toBe("Cadenza");
    expect(values.targetGoLive).toBe("");
    expect(values.dataClassification).toEqual(["Internal"]);
  });
});

describe("isTechnologyActivity (derived, never asked — G-19)", () => {
  it("is true when a system, application, or software is involved", () => {
    expect(
      isTechnologyActivity({
        activityTypes: ["A system, application, or software — including buying or configuring one"],
      }),
    ).toBe(true);
  });

  it("is false for purely non-technology activity — the case that must still route", () => {
    expect(
      isTechnologyActivity({
        activityTypes: ["A process or way of working", "People, roles, or where work is done"],
      }),
    ).toBe(false);
    expect(isTechnologyActivity({})).toBe(false);
  });
});
