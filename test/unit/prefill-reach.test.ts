/**
 * What intake decides before Tier 1 is asked, and how deep the pilot goes —
 * computed from the instrument rather than remembered.
 *
 * This file exists because of a specific failure: a demo run sheet told the
 * presenter to say "five intake answers decided six of eleven areas". Nobody
 * had measured it since the instrument moved on, and by 2026-08-22 the real
 * figure was four. A claim nothing computes is not a claim — it is a hope
 * (G-50).
 *
 * The run sheet it was written against is retired (G-74), and the assertions
 * that read it are gone with it. **The measurements stay**, because the rule
 * that produced them outlives the demo: a number this project states about
 * itself is a number something computes. The pilot's depth boundary is
 * declared to a person on screen (FR-35) and asserted by
 * `declared-boundaries.test.ts`, never by a document.
 */
import { describe, expect, it } from "vitest";
import { CATEGORIES, gateStates } from "@/lib/instrument";
import { severityQuestionsFor } from "@/lib/severity";
import type { AnswerLookup } from "@/lib/conditions";

/** The profiles the intake-reach audit measured. */
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

describe("what intake decides before Tier 1 is asked", () => {
  it("decides four of eleven areas on every profile the doc names", () => {
    for (const [name, intake] of Object.entries(PROFILES)) {
      expect(decidedBefore(intake), name).toBe(4);
    }
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
});
