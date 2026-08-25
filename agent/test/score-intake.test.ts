/**
 * §22.1 · scoring the intake description.
 *
 * The model's job is one thing: a number per dimension. Everything a person
 * reads is decided from those numbers by rules the model is not part of —
 * which is what makes this the smallest job to hand a model, and the safest
 * to be wrong about.
 */
import { describe, expect, it } from "vitest";
import {
  conflictGate,
  scoreGate,
  type ScoreTask,
} from "../src/score-intake.ts";

const task: ScoreTask = {
  description: "A claims triage assistant.",
  dimensions: [
    {
      id: "purpose",
      label: "What it does",
      anchors: { "0": "a", "1": "b", "2": "c" },
    },
    {
      id: "data",
      label: "What data",
      anchors: { "0": "a", "1": "b", "2": "c" },
    },
  ],
};

describe("what the scoring gate accepts", () => {
  it("takes the scores it asked for", () => {
    expect(scoreGate({ scores: { purpose: 4, data: 1 } }, task)).toEqual([
      { id: "purpose", score: 4 },
      { id: "data", score: 1 },
    ]);
  });

  it("accepts a partial answer rather than discarding all of it", () => {
    // A dimension nobody scored becomes nothing to ask about, which is the
    // fail-open direction.
    expect(scoreGate({ scores: { purpose: 1 } }, task)).toEqual([
      { id: "purpose", score: 1 },
    ]);
  });
});

describe("what it drops", () => {
  it("drops a dimension nobody asked about", () => {
    expect(scoreGate({ scores: { purpose: 4, invented: 1 } }, task)).toEqual([
      { id: "purpose", score: 4 },
    ]);
  });

  it("drops a score outside the rubric rather than clamping it", () => {
    // Clamping would turn nonsense into a number somebody then acts on.
    expect(scoreGate({ scores: { purpose: 7 } }, task)).toEqual([]);
    expect(scoreGate({ scores: { purpose: 0 } }, task)).toEqual([]);
    expect(scoreGate({ scores: { purpose: -1 } }, task)).toEqual([]);
    expect(scoreGate({ scores: { purpose: 1.5 } }, task)).toEqual([]);
  });

  it("drops a score that is not a number at all", () => {
    expect(scoreGate({ scores: { purpose: "3" } }, task)).toEqual([]);
    expect(scoreGate({ scores: { purpose: null } }, task)).toEqual([]);
  });

  it("survives a shape it did not expect", () => {
    expect(scoreGate({}, task)).toEqual([]);
    expect(scoreGate({ scores: "all good" }, task)).toEqual([]);
    expect(scoreGate(null, task)).toEqual([]);
    expect(scoreGate("3", task)).toEqual([]);
  });
});

/**
 * A conflict is an accusation that somebody contradicted themselves, so it
 * is only made in their own words. Both halves verbatim or it is discarded:
 * a person hunting for a disagreement that is not there costs more than the
 * contradiction we failed to report.
 */
describe("naming a contradiction", () => {
  const intake: ScoreTask = {
    description: [
      "Does this use AI or machine learning?: No",
      "What is it for?: Claims are processed via OpenAI's enterprise API.",
      "Data Elements: (not answered)",
    ].join("\n"),
    dimensions: [],
  };

  it("keeps a conflict whose halves are both quoted from the intake", () => {
    const kept = conflictGate(
      {
        conflicts: [
          {
            one: "Does this use AI or machine learning?: No",
            two: "processed via OpenAI's enterprise API",
            why: "One says no AI, the other names an AI API.",
          },
        ],
      },
      intake,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]!.why).toContain("names an AI API");
  });

  it("discards a conflict with a half that was never written", () => {
    const kept = conflictGate(
      {
        conflicts: [
          {
            one: "Does this use AI or machine learning?: No",
            two: "the vendor is Acme Analytics",
            why: "invented",
          },
        ],
      },
      intake,
    );
    expect(kept).toEqual([]);
  });

  it("treats an unanswered field as a quotable half", () => {
    // The absence IS the contradiction: data described in prose, and none
    // declared in the field that decides routing.
    const kept = conflictGate(
      {
        conflicts: [
          {
            one: "Data Elements: (not answered)",
            two: "Claims are processed via OpenAI's enterprise API",
            why: "Prose names data the field declares none of.",
          },
        ],
      },
      intake,
    );
    expect(kept).toHaveLength(1);
  });

  it("ignores a conflict quoting the same thing twice", () => {
    const kept = conflictGate(
      {
        conflicts: [
          {
            one: "Data Elements: (not answered)",
            two: "Data Elements:   (not answered)",
            why: "same half",
          },
        ],
      },
      intake,
    );
    expect(kept).toEqual([]);
  });

  it("survives a model that returns no conflicts key at all", () => {
    expect(conflictGate({ scores: {} }, intake)).toEqual([]);
    expect(conflictGate(null, intake)).toEqual([]);
  });
});
