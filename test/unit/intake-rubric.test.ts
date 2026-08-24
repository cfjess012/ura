/**
 * §22.1 · the intake quality assistant.
 *
 * The rule that matters most here is not about quality at all: **it fails
 * open**. A quality assistant that blocks submission has become a gate, and
 * the mission is reducing friction.
 */
import { describe, expect, it } from "vitest";
import {
  belowFloor,
  DIMENSIONS,
  RUBRIC_VERSION,
  scoringBrief,
  verdictFrom,
  verdictWhenAgentUnavailable,
} from "@/lib/intake-rubric";

describe("the floor catches what is not a description, with no model", () => {
  it("refuses a name on its own", () => {
    expect(belowFloor("Salesforce")).toMatch(/too thin/i);
  });

  it("refuses nothing at all", () => {
    expect(belowFloor("")).toBeTruthy();
    expect(belowFloor("     ")).toBeTruthy();
  });

  it("refuses keyboard noise", () => {
    expect(
      belowFloor(
        "asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf",
      ),
    ).toMatch(/does not read as a description/i);
  });

  it("refuses a fragment that is too short to route on", () => {
    expect(belowFloor("A new tool for the finance team.")).toMatch(/too thin/i);
  });

  it("lets a real description through", () => {
    expect(
      belowFloor(
        "A claims triage assistant from Sable Analytics that reads an incoming claim and proposes which handling queue it belongs in, with a handler confirming every proposal before anything is routed.",
      ),
    ).toBeNull();
  });
});

describe("what a person is asked for", () => {
  it("says nothing when every dimension is met", () => {
    const verdict = verdictFrom(
      DIMENSIONS.map((d) => ({ id: d.id, score: 2 as const })),
    );
    expect(verdict.passes).toBe(true);
    expect(verdict.asks).toEqual([]);
    expect(verdict.opening).toBeNull();
  });

  it("asks only for what is missing, in the rubric's own words", () => {
    const verdict = verdictFrom([
      { id: "purpose", score: 2 },
      { id: "data", score: 0 },
      { id: "who", score: 1 },
      { id: "where", score: 2 },
    ]);
    expect(verdict.passes).toBe(false);
    expect(verdict.asks.map((a) => a.id)).toEqual(["data", "who"]);
    // Verbatim from the data file, never composed in code.
    expect(verdict.asks[0]!.sentence).toBe(DIMENSIONS[1]!.feedback["0"]);
    expect(verdict.asks[1]!.sentence).toBe(DIMENSIONS[2]!.feedback["1"]);
  });

  it("shows what good looks like, so the grade is never a black box", () => {
    const verdict = verdictFrom([{ id: "data", score: 0 }]);
    expect(verdict.asks[0]!.anchor).toBe(
      DIMENSIONS.find((d) => d.id === "data")!.anchors["2"],
    );
  });

  it("treats a dimension nobody scored as nothing to ask about", () => {
    // A model returning partial scores must not invent a demand.
    expect(verdictFrom([]).passes).toBe(true);
  });
});

describe("it fails open", () => {
  it("passes when the model could not be asked", () => {
    // The alternative — blocking whenever a model is down — is the exact
    // failure this rubric exists to avoid.
    const verdict = verdictWhenAgentUnavailable();
    expect(verdict.passes).toBe(true);
    expect(verdict.asks).toEqual([]);
  });
});

describe("the rubric is data a person could read", () => {
  it("is versioned", () => {
    expect(RUBRIC_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("gives every dimension three anchors and a sentence for each shortfall", () => {
    for (const dimension of DIMENSIONS) {
      for (const band of ["0", "1", "2"] as const) {
        expect(
          dimension.anchors[band].length,
          `${dimension.id} anchor ${band}`,
        ).toBeGreaterThan(20);
      }
      for (const band of ["0", "1"] as const) {
        expect(
          dimension.feedback[band].length,
          `${dimension.id} feedback ${band}`,
        ).toBeGreaterThan(40);
      }
    }
  });

  it("never puts an internal id in front of a person", () => {
    // Identifier-SHAPED, not the bare word: "you have mentioned data."
    // ends a sentence and is fine; "intake.data" is not.
    const identifier = /\b[a-z]+[._][a-z_]+\b/;
    for (const dimension of DIMENSIONS) {
      expect(dimension.label).not.toMatch(/[._]/);
      for (const band of ["0", "1"] as const) {
        expect(dimension.feedback[band], `${dimension.id} ${band}`).not.toMatch(
          identifier,
        );
      }
      for (const band of ["0", "1", "2"] as const) {
        expect(
          dimension.anchors[band],
          `${dimension.id} anchor ${band}`,
        ).not.toMatch(identifier);
      }
    }
  });

  it("offers starters that would themselves pass — never one the rubric would mark down", () => {
    // A product that suggests a sentence its own rubric scores 1 is
    // arguing with itself. A starter marked incomplete is deliberately a
    // sentence opener, and it says so by ending mid-phrase.
    for (const dimension of DIMENSIONS) {
      for (const starter of dimension.starters) {
        if (starter.complete) {
          expect(
            starter.insert.trim(),
            `${dimension.id}: ${starter.label}`,
          ).toMatch(/[.!?]$/);
        } else {
          expect(starter.insert, `${dimension.id}: ${starter.label}`).toMatch(
            /\s$/,
          );
        }
      }
    }
  });

  it("hands the model the anchors, so it scores against published words", () => {
    const brief = scoringBrief();
    expect(brief).toHaveLength(DIMENSIONS.length);
    expect(brief[0]!.anchors["2"]).toBeTruthy();
  });
});
