/**
 * §22.1 · scoring the intake description.
 *
 * The model's job is one thing: a number per dimension. Everything a person
 * reads is decided from those numbers by rules the model is not part of —
 * which is what makes this the smallest job to hand a model, and the safest
 * to be wrong about.
 */
import { describe, expect, it } from "vitest";
import { scoreGate, type ScoreTask } from "../src/score-intake.ts";

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
