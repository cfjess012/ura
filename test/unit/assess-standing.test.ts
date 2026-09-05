/**
 * G-91 · where an assessment stands, and the one thing to do next.
 *
 * The screen was 1,067 words and three scrolls at the moment a person wants
 * to finish. These pin what replaced it: four rows of status, and exactly one
 * next action — whichever step is unfinished first.
 */
import { describe, expect, it } from "vitest";
import { assessJourney } from "@/lib/assess-journey";
import { STANDING_LABEL, standingFor } from "@/lib/assess-standing";
import { CATEGORIES } from "@/lib/instrument";
import { SEVERITY_QUESTIONS } from "@/lib/severity";
import { objectivesFor } from "@/lib/tier3";
import { accumulatedFor, severityQuestionsFor } from "@/lib/severity";
import { litPaths, pathSelectionsFrom } from "@/lib/engine";

const said = (value: unknown) => ({ value, source: "person", confirmed: true });
type Answers = Record<
  string,
  { value: unknown; source: string; confirmed: boolean }
>;

const stand = (stored: Answers) =>
  standingFor({
    journey: assessJourney(stored, {}),
    projectId: "p1",
  });

/** Every gate answered No — the shortest complete assessment there is. */
const allClosed: Answers = Object.fromEntries(
  CATEGORIES.filter((c) => c.questionId).map((c) => [c.questionId, said("No")]),
);

const thirdParty = CATEGORIES.find((c) => c.key === "third-party")!;
const provider = SEVERITY_QUESTIONS.find((q) => q.path === "TPR_LA")!.questionId;
/**
 * Answer every severity question this assessment actually asks.
 *
 * Business Criticality applies to every assessment whatever the gates say, so
 * a fixture that only answers the third-party band still has three questions
 * outstanding — which is what made the first draft of these tests wrong.
 */
function rateEverything(stored: Answers, band = "Medium"): Answers {
  const gates = assessJourney(stored, {}).gates;
  const lit = litPaths(CATEGORIES, gates, pathSelectionsFrom(CATEGORIES, stored), {});
  const out: Answers = { ...stored };
  for (const question of severityQuestionsFor(lit.map((p) => p.id))) {
    if (!out[question.questionId]) out[question.questionId] = said(band);
  }
  return out;
}

/** One area open, its path ticked, its severity High — controls are owed. */
const owing: Answers = rateEverything({
  ...allClosed,
  [thirdParty.questionId]: said("Yes"),
  [thirdParty.pathQuestion!.questionId]: said(["TPR_LA"]),
  [provider]: said("High"),
});

/** Everything closed, and the always-asked bands rated Low — nothing owed. */
const nothingOwed: Answers = rateEverything(allClosed, "Low");

describe("the four rows", () => {
  it("has one row per step, each with a state that is a word", () => {
    const standing = stand(owing);
    expect(standing.rows.map((r) => r.label)).toEqual([
      "Risk areas",
      "Which parts",
      "How severe",
      "Controls",
    ]);
    for (const row of standing.rows) {
      expect(STANDING_LABEL[row.state].length).toBeGreaterThan(3);
      expect(row.detail.length).toBeGreaterThan(3);
      // No internal identifier reaches a row (NFR-9).
      expect(row.detail).not.toMatch(/T[0-9]-[A-Z]{2,5}-[0-9]/);
    }
  });

  it("names its unit, because the rail beside it counts a different one", () => {
    // "5 answered" in the rail meant five AREAS; "19 rated" here meant
    // nineteen QUESTIONS. Side by side on one screen they read as a
    // contradiction, which is what the owner saw.
    const done = stand(owing).rows.find((r) => r.label === "How severe")!;
    expect(done.detail).toMatch(/question/);
    expect(done.detail).toMatch(/area/);
    // Part way through it still names the unit, which is the whole point.
    const partial = stand({
      ...allClosed,
      [thirdParty.questionId]: said("Yes"),
      [thirdParty.pathQuestion!.questionId]: said(["TPR_LA"]),
      [provider]: said("High"),
    }).rows.find((r) => r.label === "How severe")!;
    expect(partial.detail).toMatch(/questions rated/);
  });

  it("says a step has nothing to do rather than reading as unfinished", () => {
    // An area that asks no follow-up and one nobody has answered used to be
    // indistinguishable. Zero of zero is not progress owed (§24.9).
    const rows = stand(nothingOwed).rows;
    const parts = rows.find((r) => r.label === "Which parts")!;
    const controls = rows.find((r) => r.label === "Controls")!;
    expect(parts.state).toBe("nothing-to-do");
    expect(controls.state).toBe("nothing-to-do");
    expect(controls.detail).toMatch(/require none/);
  });
});

describe("exactly one thing to do next", () => {
  it("points at the nearest unfinished step, not the biggest", () => {
    // Nothing answered at all: the risk areas come first.
    const fresh = stand({});
    expect(fresh.next!.label).toMatch(/risk area/);
    expect(fresh.next!.href).toContain("/assess/");
    expect(fresh.headline).toBe("Still working out what applies.");
  });

  it("moves to the parts, then severity, then the controls", () => {
    const gatesOnly: Answers = {
      ...allClosed,
      [thirdParty.questionId]: said("Yes"),
    };
    expect(stand(gatesOnly).next!.label).toMatch(/Narrow down/);
    expect(stand(gatesOnly).next!.href).toMatch(/\/paths$/);

    const parted: Answers = {
      ...gatesOnly,
      [thirdParty.pathQuestion!.questionId]: said(["TPR_LA"]),
    };
    expect(stand(parted).next!.label).toMatch(/severity question/);
    expect(stand(parted).next!.href).toMatch(/\/severity\//);

    expect(stand(owing).next!.label).toMatch(/control question/);
    expect(stand(owing).next!.href).toMatch(/\/objectives$/);
    expect(stand(owing).headline).toBe("Ready for its control questions.");
  });

  it("offers nothing further once every step is done", () => {
    // Then handing it over stops being the alternative and becomes the act.
    const answered: Answers = { ...owing };
    for (const objective of objectivesFor(
      accumulatedFor(owing, {}).map((c) => c.objective),
    )) {
      answered[objective.questionId] = said({ answer: "Yes", note: "" });
    }
    const standing = stand(answered);
    expect(standing.next).toBeNull();
    expect(standing.headline).toBe("Everything is answered.");
    expect(standing.rows.find((r) => r.label === "Controls")!.state).toBe(
      "answered",
    );
  });

  it("says so plainly when the answers require no controls at all", () => {
    const standing = stand(nothingOwed);
    expect(standing.next).toBeNull();
    expect(standing.headline).toBe("Nothing further is required.");
    expect(standing.lede).toMatch(/Nothing is outstanding/);
  });
});

describe("the words at the top", () => {
  it("answers 'am I done', and never recaps the rows", () => {
    for (const stored of [{}, owing, nothingOwed]) {
      const standing = stand(stored as Answers);
      expect(standing.headline).toMatch(/\.$/);
      expect(standing.headline.split(" ").length).toBeLessThan(9);
      // The lede is one sentence of context, not the table in prose.
      expect(standing.lede.split(" ").length).toBeLessThan(45);
    }
  });

  it("counts what is left for the person, never a total they cannot move", () => {
    const standing = stand(owing);
    const owed =
      assessJourney(owing, {}).controls.total -
      assessJourney(owing, {}).controls.answered;
    expect(standing.next!.label).toContain(String(owed));
    expect(standing.lede).toContain(String(owed));
  });
});

describe("areas the system decided", () => {
  it("names each one and where the decision came from", () => {
    // An assessment that answers itself in five places with no visible
    // reason has surprised somebody with their own record (§24.5, §24.6).
    const decided = stand(owing).decided;
    expect(decided.length).toBeGreaterThan(0);
    for (const area of decided) {
      expect(area.name.length).toBeGreaterThan(3);
      expect(area.because.length).toBeGreaterThan(10);
      expect(["from your intake", "from your answers", "always applies"]).toContain(
        area.from,
      );
      // Plain language, no internal identifiers (NFR-9).
      expect(area.because).not.toMatch(/T[0-9]-[A-Z]{2,5}-[0-9]|[a-z]+\.[a-z_]+/);
    }
  });

  it("distinguishes an area settled outright from one read off the intake", () => {
    const decided = stand(owing).decided;
    // Governance applies to every assessment; nobody is ever asked.
    const always = decided.find((a) => a.from === "always applies");
    expect(always).toBeDefined();
    expect(always!.because).toMatch(/every assessment/);
  });

  it("lists nothing when the person answered every area themselves", () => {
    // allClosed answers each gate by hand, so only the settled one remains.
    const decided = stand(allClosed).decided;
    expect(decided.every((a) => a.from === "always applies")).toBe(true);
  });
});
