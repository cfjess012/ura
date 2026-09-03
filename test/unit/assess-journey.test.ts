/**
 * §4.1 · the Assess stage as one map.
 *
 * Owner-reported 2026-09-02: "Next" on the last risk area "just randomly
 * takes you to this narrow section". The step was real; the rail did not
 * know it, and the button did not name it. These hold the derivation every
 * screen now draws from, so the map and the buttons cannot disagree again.
 */
import { describe, expect, it } from "vitest";
import { afterAreas, assessJourney, type StoredAnswers } from "@/lib/assess-journey";
import { askableCategories, CATEGORIES } from "@/lib/instrument";

const said = (value: unknown) => ({ value, source: "person", confirmed: true });

/** Every askable gate answered the same way. */
function allGates(answer: "Yes" | "No"): StoredAnswers {
  const stored: StoredAnswers = {};
  for (const c of askableCategories()) stored[c.questionId] = said(answer);
  return stored;
}

const withParts = CATEGORIES.filter((c) => c.pathQuestion && !c.alwaysApplies);
const security = CATEGORIES.find((c) => c.key === "security-resilience")!;

describe("the map of the stage", () => {
  it("numbers the parts step by the risk-areas list, not by itself", () => {
    const stored = allGates("No");
    stored[security.questionId] = said("Yes");
    const journey = assessJourney(stored, {});
    expect(journey.parts).toHaveLength(1);
    const part = journey.parts[0]!;
    expect(part.category.key).toBe(security.key);
    // The card six inches to the right wears the same number.
    expect(part.number).toBe(
      journey.walk.findIndex((g) => g.category.key === security.key) + 1,
    );
    expect(part.total).toBe(security.pathQuestion!.options.length);
    expect(part.answered).toBe(false);
    expect(journey.partsRemaining).toBe(1);
  });

  it("counts a deliberate 'none of these' as an answer", () => {
    const stored = allGates("No");
    stored[security.questionId] = said("Yes");
    stored[security.pathQuestion!.questionId] = said([]);
    const journey = assessJourney(stored, {});
    expect(journey.parts[0]!.answered).toBe(true);
    expect(journey.parts[0]!.ticked).toBe(0);
    expect(journey.partsRemaining).toBe(0);
  });

  it("opens a step only once the ones before it are answered", () => {
    const early = assessJourney({}, {});
    expect(early.gatesRemaining).toBeGreaterThan(0);
    expect(early.reach).toEqual({ parts: false, severity: false, controls: false });

    const stored = allGates("No");
    stored[security.questionId] = said("Yes");
    const narrowing = assessJourney(stored, {});
    expect(narrowing.reach.parts).toBe(true);
    expect(narrowing.reach.severity).toBe(false);

    stored[security.pathQuestion!.questionId] = said([]);
    expect(assessJourney(stored, {}).reach.severity).toBe(true);
  });

  it("has a parts step only for open areas that ask one", () => {
    // Every area that can ask, answered Yes: all of them appear, in order.
    const stored = allGates("Yes");
    const journey = assessJourney(stored, {});
    expect(journey.parts.map((p) => p.category.key)).toEqual(
      withParts.map((c) => c.key),
    );
    // Closed, none appear.
    expect(assessJourney(allGates("No"), {}).parts).toEqual([]);
  });
});

describe("where the last risk area's Next goes", () => {
  it("names the parts screen when some area asks for it", () => {
    const stored = allGates("No");
    stored[security.questionId] = said("Yes");
    expect(afterAreas(assessJourney(stored, {}), false)).toEqual({
      path: "paths",
      label: "Next: which parts apply →",
    });
  });

  it("skips the parts screen when nothing needs narrowing", () => {
    const after = afterAreas(assessJourney(allGates("No"), {}), false);
    expect(after.path).not.toBe("paths");
    expect(after.label).not.toMatch(/which parts/);
    // And still says where it is going, by name.
    expect(after.label).toMatch(/^Next: /);
  });

  it("goes to the parts screen when the area being answered has parts", () => {
    // The screen is rendered before the answer; a Yes here would create a
    // part to narrow that this journey cannot see yet.
    const after = afterAreas(assessJourney(allGates("No"), {}), true);
    expect(after.path).toBe("paths");
  });
});
