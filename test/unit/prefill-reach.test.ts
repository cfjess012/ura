/**
 * The numbers `demo/readiness.md` tells us to say out loud, computed from the
 * instrument rather than remembered.
 *
 * This file exists because of a specific failure: the readiness doc told the
 * presenter to say "five intake answers decided six of eleven areas". Nobody
 * had measured it since the instrument moved on, and by 2026-08-22 the real
 * figure was four. A sentence that a person is instructed to say in front of
 * an audience is a claim the product makes, and a claim nothing computes is
 * not a claim — it is a hope (G-50).
 *
 * The rule generalises: if the doc states a measurement, the measurement is
 * asserted here, and the doc cites this file.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORIES, gateStates } from "@/lib/instrument";
import { severityQuestionsFor } from "@/lib/severity";
import type { AnswerLookup } from "@/lib/conditions";

/** The profiles the audit measured, kept in step with `demo/readiness.md`. */
const PROFILES: Record<string, AnswerLookup> = {
  "SaaS purchase": {
    thirdPartyInvolved: "Yes", usesAi: "No",
    dataClassification: "Internal", initiativeType: "A new initiative",
  },
  "In-house AI tool": {
    thirdPartyInvolved: "No", usesAi: "Yes",
    dataClassification: "Confidential", initiativeType: "A new initiative",
  },
  "Vendor renewal": {
    thirdPartyInvolved: "Yes", usesAi: "No",
    dataClassification: "Internal", initiativeType: "A vendor renewal",
  },
  "Process change": {
    thirdPartyInvolved: "No", usesAi: "No",
    dataClassification: "Public", initiativeType: "A new initiative",
  },
  "Unsure about AI": {
    thirdPartyInvolved: "I'm not sure", usesAi: "I'm not sure",
    dataClassification: "Internal", initiativeType: "A new initiative",
  },
};

const decidedBefore = (intake: AnswerLookup) =>
  gateStates({}, intake).filter((s) => s.settled || s.fromIntake).length;

const readiness = () =>
  readFileSync(join(__dirname, "..", "..", "demo", "readiness.md"), "utf8");

describe("what intake decides before Tier 1 is asked", () => {
  it("decides four of eleven areas on every profile the doc names", () => {
    for (const [name, intake] of Object.entries(PROFILES)) {
      expect(decidedBefore(intake), name).toBe(4);
    }
  });

  it("is the number the readiness doc tells the presenter to say", () => {
    expect(readiness()).toContain("four intake answers decide four of eleven areas");
  });
});

describe("the pilot depth boundary (G-50)", () => {
  /** A category is deep when a person who opens it is asked something more. */
  const deep = CATEGORIES.filter((c) => {
    const paths = [
      ...(c.pathQuestion?.options ?? []).map((o) => o.id),
      ...(c.derivedPaths ?? []).map((p) => p.id),
    ];
    return paths.length > 0 && severityQuestionsFor(paths).length > 0;
  }).map((c) => c.key);

  it("is exactly the four areas the governance log names", () => {
    expect([...deep].sort()).toEqual(
      ["ai", "data-privacy", "security-resilience", "third-party"].sort(),
    );
  });

  it("leaves seven areas that ask nothing further", () => {
    expect(CATEGORIES.length - deep.length).toBe(7);
  });

  it("is declared in the readiness doc, not left for a person to discover", () => {
    // A boundary nobody wrote down is indistinguishable from a defect (G-50).
    expect(readiness()).toContain("Depth exists in four of the eleven risk areas");
  });
});
