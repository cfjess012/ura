/**
 * The pure intake logic (SPEC §26.1) — no database, no framework, no
 * environment. These are the tests that will run unchanged as a CodeBuild
 * step, and the reason the same logic can move into a Lambda handler.
 */
import { UNLISTED_OPTION, unlistedKey } from "../../src/lib/intake-values";
import { listBySlug } from "../../src/lib/reference";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { intakeAsDocument } from "../../src/lib/intake";
import {
  intakeChanges,
  SCOPE_KEY,
  intakePatchFrom,
  intakeValuesForReading,
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
      collaborators: ["Wei Chen, Petra Novak"],
    });
    expect(savingOwnershipOnly.collaborators).toBe("Wei Chen, Petra Novak");
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
    const before = { projectName: "Cadenza", collaborators: "P. Sharma" };
    const changes = intakeChanges(before, {
      projectName: "Cadenza",
      collaborators: "N. Kahan",
    });
    expect(changes).toEqual([
      { fieldId: "collaborators", previousValue: "P. Sharma", value: "N. Kahan" },
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
    expect(intakeChanges({}, { collaborators: "" })).toEqual([]);
    expect(intakeChanges({ dataElements: [] }, { dataElements: [] })).toEqual([]);
  });

  it("records clearing a field as a change, with what was lost", () => {
    const changes = intakeChanges({ targetGoLive: "2026-11-02" }, { targetGoLive: null });
    expect(changes).toEqual([
      { fieldId: "targetGoLive", previousValue: "2026-11-02", value: null },
    ]);
  });
});

/**
 * S4.5 — a picked answer is a record of what the person saw, not a string
 * (FR-29, FR-30, NFR-22; G-46, G-47).
 */
describe("reference-backed fields", () => {
  const DIRECTORY = [
    { id: "d.chen", label: "Wei Chen" },
    { id: "d.novak", label: "Petra Novak" },
  ];
  const scope = (...ids: string[]) => ({ [SCOPE_KEY]: ids });

  it("stores the entry, the label shown, and the list version", () => {
    const patch = intakePatchFrom(
      { ...scope("businessUnit"), businessUnit: ["BU_LEG"] },
      DIRECTORY,
    );
    expect(patch.businessUnit).toEqual({
      id: "BU_LEG",
      label: "Legal",
      version: listBySlug("business-units")!.version,
    });
  });

  it("stores a person's name beside their id — names change too", () => {
    const patch = intakePatchFrom(
      { ...scope("businessOwner"), businessOwner: ["d.chen"] },
      DIRECTORY,
    );
    expect(patch.businessOwner).toMatchObject({ id: "d.chen", label: "Wei Chen" });
  });

  it("takes several for a pick-many, in the order they were given", () => {
    const patch = intakePatchFrom(
      { ...scope("vendorNames"), vendorNames: ["V_SNOWFLAKE", "V_MICROSOFT"] },
      DIRECTORY,
    );
    expect((patch.vendorNames as { label: string }[]).map((v) => v.label)).toEqual([
      "Snowflake",
      "Microsoft",
    ]);
  });

  it("records an off-list answer as its own shape, never as an id", () => {
    const patch = intakePatchFrom(
      {
        ...scope("vendorNames"),
        vendorNames: [UNLISTED_OPTION],
        [unlistedKey("vendorNames")]: ["Novara Health"],
      },
      DIRECTORY,
    );
    expect(patch.vendorNames).toEqual([{ unlisted: "Novara Health" }]);
  });

  it("keeps listed and off-list answers side by side", () => {
    const patch = intakePatchFrom(
      {
        ...scope("vendorNames"),
        vendorNames: ["V_SAP", UNLISTED_OPTION],
        [unlistedKey("vendorNames")]: ["Novara Health"],
      },
      DIRECTORY,
    );
    expect(patch.vendorNames).toEqual([
      { id: "V_SAP", label: "SAP", version: listBySlug("vendors")!.version },
      { unlisted: "Novara Health" },
    ]);
  });

  it("drops an off-list choice with nothing typed rather than storing a blank", () => {
    const patch = intakePatchFrom(
      {
        ...scope("vendorNames"),
        vendorNames: [UNLISTED_OPTION],
        [unlistedKey("vendorNames")]: ["   "],
      },
      DIRECTORY,
    );
    expect(patch.vendorNames).toEqual([]);
  });

  it("drops an id that is not on the list rather than inventing an answer", () => {
    const patch = intakePatchFrom(
      { ...scope("businessUnit"), businessUnit: ["BU_INVENTED"] },
      DIRECTORY,
    );
    expect(patch.businessUnit).toBeNull();
  });

  it("clearing a pick-many inside its own scope persists as empty", () => {
    const patch = intakePatchFrom(scope("vendorNames"), DIRECTORY);
    expect(patch.vendorNames).toEqual([]);
  });

  it("a changed list version is a changed answer, not a non-event", () => {
    // The version is part of what the record says, so re-pinning it has to
    // show up in the history.
    const before = { businessUnit: { id: "BU_LEG", label: "Legal", version: "2026-01-01.1" } };
    const after = { businessUnit: { id: "BU_LEG", label: "Legal", version: "2026-08-21.1" } };
    expect(intakeChanges(before, after)).toHaveLength(1);
    expect(intakeChanges(before, before)).toEqual([]);
  });
});

describe("a saved answer reloads as what the person chose", () => {
  it("round-trips listed and off-list values back into the form", () => {
    const stored = {
      vendorNames: [
        { id: "V_SAP", label: "SAP", version: "2026-08-21.1" },
        { unlisted: "Novara Health" },
        { unlisted: "Aster Labs" },
      ],
      businessUnit: { id: "BU_LEG", label: "Legal", version: "2026-08-21.1" },
    };
    const values = intakeValuesFrom(stored);
    expect(values.vendorNames).toEqual(["V_SAP", UNLISTED_OPTION]);
    expect(values[unlistedKey("vendorNames")]).toBe("Novara Health\nAster Labs");
    expect(values.businessUnit).toBe("BU_LEG");
  });

  it("survives a full round trip unchanged", () => {
    const submitted = {
      [SCOPE_KEY]: ["vendorNames"],
      vendorNames: ["V_SAP", UNLISTED_OPTION],
      [unlistedKey("vendorNames")]: ["Novara Health\nAster Labs"],
    };
    const patch = intakePatchFrom(submitted, []);
    const values = intakeValuesFrom(patch as Record<string, unknown>);
    expect(intakePatchFrom(
      {
        [SCOPE_KEY]: ["vendorNames"],
        vendorNames: values.vendorNames as string[],
        [unlistedKey("vendorNames")]: [values[unlistedKey("vendorNames")] as string],
      },
      [],
    )).toEqual(patch);
  });
});

describe("a section's form only speaks for its own fields (verifier R1)", () => {
  // The hydration effect read every field in the instrument out of a form
  // that renders one section, so the other three sections' saved values came
  // back as "" and were written into client state. A complete intake then
  // reported 5, 7 and 8 answers outstanding on three consecutive screens —
  // the record was intact, the counts a person read were false (§24.9).
  it("the form hydrates from the rendered section, never the whole instrument", () => {
    const source = readFileSync(
      join(__dirname, "..", "..", "src/app/(app)/projects/[id]/intake/section-form.tsx"),
      "utf8",
    );
    expect(source).toMatch(/for \(const field of section\.fields\)/);
    expect(source, "hydration must not iterate ALL_FIELDS").not.toMatch(
      /for \(const field of ALL_FIELDS\)/,
    );
  });
});

describe("what a model is handed — labels, never ids (NFR-9, §7)", () => {
  const row = {
    projectName: "Board reporting assistant",
    projectDescription: "Drafts the quarterly board pack.",
    businessUnit: { id: "BU_ENG", label: "Engineering", version: "2026-08-21.1" },
    businessOwner: {
      id: "d.withers",
      label: "Isabelle Withers — Head of Claims Operations",
      version: "directory",
    },
    technicalOwner: {
      id: "d.whitfield",
      label: "Grace Whitfield — Senior Counsel, Legal",
      version: "directory",
    },
  } as unknown as Record<string, unknown>;

  it("resolves a reference answer to its label", () => {
    const read = intakeValuesForReading(row);
    expect(read.businessUnit).toBe("Engineering");
    expect(read.businessOwner).toBe("Isabelle Withers — Head of Claims Operations");
  });

  it("keeps ids where a FORM needs them, so the two readings stay distinct", () => {
    // intakeValuesFrom flattens deliberately: a select pre-selects by id.
    expect(intakeValuesFrom(row).businessUnit).toBe("BU_ENG");
  });

  it("puts no internal identifier in the document a model reads", () => {
    // Observed 2026-08-26: handed the form values, the check told a person
    // their business unit was "BU_ENG" and named two owners — d.grant and
    // d.reyes — who had never been on the assessment. An opaque token is
    // not something a model can check, and what it cannot check it invents.
    const doc = intakeAsDocument(intakeValuesForReading(row), {
      blanks: "named",
    });
    expect(doc).toContain("Engineering");
    expect(doc).toContain("Isabelle Withers");
    expect(doc).not.toMatch(/\bBU_[A-Z]+\b/);
    expect(doc).not.toMatch(/\bd\.[a-z]+\b/);
  });

  it("carries an off-list answer as the words that were typed", () => {
    const typed = intakeValuesForReading({
      ...row,
      businessUnit: { unlisted: "Group Treasury" },
    } as unknown as Record<string, unknown>);
    expect(typed.businessUnit).toBe("Group Treasury");
  });
});

describe("reading values never bring down the page they are read on", () => {
  it("survives a value that is not a reference answer", () => {
    // A legacy row, or a caller handing over already-flattened values.
    // `labelOf` returns undefined for these rather than throwing, and
    // filtering on `label.trim()` then threw inside a render — the whole
    // screen went to the error boundary over one unlabelled value.
    expect(() =>
      intakeValuesForReading({
        projectName: "Legacy",
        businessUnit: "BU_ENG",
        vendorNames: ["V_SNOWFLAKE", { id: "V_X", label: "Acme" }],
      } as unknown as Record<string, unknown>),
    ).not.toThrow();
  });

  it("keeps the labels it can read and drops the ones it cannot", () => {
    const read = intakeValuesForReading({
      vendorNames: ["V_SNOWFLAKE", { id: "V_X", label: "Acme", version: "d" }],
    } as unknown as Record<string, unknown>);
    expect(read.vendorNames).toEqual(["Acme"]);
  });
});
