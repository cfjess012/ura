/**
 * FR-43 · the graded intake rubric.
 *
 * Five criteria, four levels, scored over the whole intake. The rules that
 * matter most are not about grading at all: **it never blocks**, and a
 * score never appears as a bare number.
 */
import { describe, expect, it } from "vitest";
import {
  bandFor,
  belowFloor,
  coherenceFrom,
  coherenceWhenUnavailable,
  CRITERIA,
  RUBRIC_VERSION,
  scoringBrief,
  type Level,
} from "@/lib/intake-rubric";

const all = (level: Level) => CRITERIA.map((c) => ({ id: c.id, level }));

describe("the floor catches what is not a description, with no model", () => {
  it("refuses a product name on its own", () => {
    expect(belowFloor("Salesforce")).toMatch(/too thin/i);
  });

  it("refuses keyboard noise", () => {
    expect(belowFloor("asdf ".repeat(20))).toMatch(
      /does not read as a description/i,
    );
  });

  it("lets a real description through", () => {
    expect(
      belowFloor(
        "A claims triage assistant from Sable Analytics that reads an incoming claim and proposes which handling queue it belongs in, with a handler confirming every proposal.",
      ),
    ).toBeNull();
  });
});

describe("five criteria, four levels", () => {
  it("has exactly the five the rubric names", () => {
    expect(CRITERIA.map((c) => c.id)).toEqual([
      "clarity",
      "consistency",
      "audience",
      "dataAccess",
      "sensitivity",
    ]);
  });

  it("gives every criterion four anchors and an ask for every shortfall", () => {
    for (const criterion of CRITERIA) {
      for (const level of ["1", "2", "3", "4"] as const) {
        expect(
          criterion.anchors[level].length,
          `${criterion.id} anchor ${level}`,
        ).toBeGreaterThan(30);
      }
      for (const level of ["1", "2", "3"] as const) {
        expect(
          criterion.ask[level].length,
          `${criterion.id} ask ${level}`,
        ).toBeGreaterThan(20);
      }
    }
  });

  it("is versioned, and hands the model the anchors it grades against", () => {
    expect(RUBRIC_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(scoringBrief()).toHaveLength(5);
    expect(scoringBrief()[0]!.anchors["4"]).toBeTruthy();
  });
});

describe("the score becomes a band, never a bare number", () => {
  it("reads full marks as robust", () => {
    const result = coherenceFrom(all(4));
    expect(result.score).toBe(20);
    expect(result.band).toBe("Robust");
    expect(result.asks).toEqual([]);
  });

  it("reads the floor of the scale as not yet usable", () => {
    const result = coherenceFrom(all(1));
    expect(result.score).toBe(5);
    expect(result.band).toBe("Not yet usable");
  });

  it("bands the middle of the range", () => {
    expect(bandFor(16).label).toBe("Workable");
    expect(bandFor(12).label).toBe("Thin");
  });

  it("always carries a meaning beside the band — a number alone says nothing", () => {
    for (const level of [1, 2, 3, 4] as Level[]) {
      const result = coherenceFrom(all(level));
      expect(result.meaning, `level ${level}`).toBeTruthy();
    }
  });
});

describe("what a person is asked for", () => {
  it("asks only about what fell short, in the rubric's own words", () => {
    const result = coherenceFrom([
      { id: "clarity", level: 4 },
      { id: "consistency", level: 4 },
      { id: "audience", level: 2 },
      { id: "dataAccess", level: 4 },
      { id: "sensitivity", level: 4 },
    ]);
    expect(result.asks).toHaveLength(1);
    expect(result.asks[0]!.id).toBe("audience");
    expect(result.asks[0]!.sentence).toBe(
      CRITERIA.find((c) => c.id === "audience")!.ask["2"],
    );
  });

  it("shows what full marks look like, so the grade is never a black box", () => {
    const result = coherenceFrom([{ id: "clarity", level: 1 }]);
    expect(result.asks[0]!.anchor).toBe(CRITERIA[0]!.anchors["4"]);
  });

  it("puts the two that decide routing first, however thin the others are", () => {
    // A thin answer on data access is a wrong routing, not a vague one.
    const result = coherenceFrom([
      { id: "clarity", level: 1 },
      { id: "consistency", level: 1 },
      { id: "audience", level: 1 },
      { id: "dataAccess", level: 3 },
      { id: "sensitivity", level: 3 },
    ]);
    expect(
      result.asks
        .slice(0, 2)
        .map((a) => a.id)
        .sort(),
    ).toEqual(["dataAccess", "sensitivity"]);
    expect(
      result.asks.every(
        (a) => a.routing === (a.id === "dataAccess" || a.id === "sensitivity"),
      ),
    ).toBe(true);
  });

  it("treats a criterion nobody scored as met, not as a demand", () => {
    // Fail-open, applied one criterion at a time: a partial answer from a
    // model must never invent a thing to ask for.
    const result = coherenceFrom([{ id: "clarity", level: 2 }]);
    expect(result.asks.map((a) => a.id)).toEqual(["clarity"]);
    expect(result.score).toBe(2 + 4 * 4);
  });
});

describe("it fails open", () => {
  it("scores nothing and asks nothing when the model could not be reached", () => {
    const result = coherenceWhenUnavailable();
    expect(result.score).toBeNull();
    expect(result.asks).toEqual([]);
    // And says so, rather than reporting a pass it never checked.
    expect(result.checkedByModel).toBe(false);
  });

  it("marks a real grading as checked, so a pass can be told from a shrug", () => {
    expect(coherenceFrom(all(4)).checkedByModel).toBe(true);
  });

  it("never returns anything that could block a person", () => {
    // There is no field here a caller could read as "stop". If one is ever
    // wanted, that is a governance decision (G-69), not a default.
    const result = coherenceFrom(all(1));
    expect(Object.keys(result)).not.toContain("blocked");
    expect(Object.keys(result)).not.toContain("passes");
  });
});

/**
 * A contradiction is not offset by the criteria around it — it undermines
 * them, because any one of those answers may be the half that is wrong.
 * Five criteria summed will happily call a self-contradicting intake
 * "Workable. The gaps below are specific and quick to close."
 */
describe("a contradiction caps the band", () => {
  const strongExcept = (consistency: 1 | 2 | 3 | 4) => [
    { id: "clarity", level: 4 as const },
    { id: "consistency", level: consistency },
    { id: "audience", level: 4 as const },
    { id: "dataAccess", level: 4 as const },
    { id: "sensitivity", level: 4 as const },
  ];

  it("caps at Thin when the intake contradicts itself outright", () => {
    const result = coherenceFrom(strongExcept(1));
    expect(result.score).toBe(17); // a Robust sum
    expect(bandFor(17).label).toBe("Robust");
    expect(result.band).toBe("Thin"); // ...that the ceiling overrides
  });

  it("caps at Workable for a minor conflict", () => {
    expect(coherenceFrom(strongExcept(2)).band).toBe("Workable");
  });

  it("leaves a consistent intake alone", () => {
    expect(coherenceFrom(strongExcept(4)).band).toBe("Robust");
  });

  it("never raises a band the sum already put lower", () => {
    const thin = coherenceFrom([
      { id: "clarity", level: 1 },
      { id: "consistency", level: 2 },
      { id: "audience", level: 1 },
      { id: "dataAccess", level: 1 },
      { id: "sensitivity", level: 1 },
    ]);
    expect(thin.band).toBe("Not yet usable");
  });
});

/**
 * The copy used to say "Both are named below" while the model returned
 * nothing but integers, so there was no below. Never promise a quote the
 * architecture cannot show.
 */
describe("what a person is told about conflicts", () => {
  const scored = [{ id: "consistency", level: 1 as const }];

  it("counts the pairs rather than always saying two", () => {
    const four = coherenceFrom(scored, [
      { one: "a", two: "b", why: "" },
      { one: "c", two: "d", why: "" },
      { one: "e", two: "f", why: "" },
      { one: "g", two: "h", why: "" },
    ]);
    const ask = four.asks.find((a) => a.id === "consistency")!;
    expect(ask.sentence).toContain("4 pairs");
    expect(ask.conflicts).toHaveLength(4);
  });

  it("says 'both' when there is exactly one pair", () => {
    const one = coherenceFrom(scored, [{ one: "a", two: "b", why: "" }]);
    expect(one.asks[0]!.sentence).toContain("Both are quoted below");
  });

  it("promises no quotes when none survived the gate", () => {
    const none = coherenceFrom(scored, []);
    const ask = none.asks.find((a) => a.id === "consistency")!;
    expect(ask.conflicts).toEqual([]);
    expect(ask.sentence).not.toContain("quoted below");
    expect(ask.unquoted).toBeTruthy();
  });
});
