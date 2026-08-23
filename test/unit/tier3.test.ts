/**
 * S6 · Tier 3 (SPEC §3.4, FR-12, FR-13).
 *
 * The tier that asks whether a required control actually exists. Its answers
 * are what findings are synthesised from at submit, so a wrong rule here
 * becomes a wrong finding later.
 */
import { describe, expect, it } from "vitest";
import {
  OBJECTIVES,
  TIER3,
  TIER3_ANSWERS,
  childrenAsked,
  isTier3Value,
  noteProblem,
  noteRequired,
  objectivesFor,
  tier3SubmissionProblems,
  withoutQuestions,
  type Tier3Value,
} from "@/lib/tier3";
import { controlName } from "@/lib/severity";

describe("the instrument content", () => {
  it("declares all four answers §3.4 defines", () => {
    expect(TIER3.answers).toEqual([...TIER3_ANSWERS]);
  });

  it("covers the objectives the owner's instrument has questions for", () => {
    expect(OBJECTIVES).toHaveLength(15);
    expect(OBJECTIVES.flatMap((o) => o.children)).toHaveLength(36);
  });

  it("every objective is a control the accumulation can actually produce", () => {
    // Content nobody can reach is content that never gets asked (C-10).
    for (const objective of OBJECTIVES) {
      expect(controlName(objective.id), objective.id).toBeTruthy();
      expect(objective.name).toBe(controlName(objective.id));
    }
  });

  it("asks a real question, never an identifier", () => {
    for (const objective of OBJECTIVES) {
      expect(objective.text.length, objective.id).toBeGreaterThan(20);
      expect(objective.text).not.toMatch(/T[123]-[A-Z]{2,5}-\d/);
      for (const child of objective.children) {
        expect(child.text.length, child.id).toBeGreaterThan(15);
        expect(child.text).not.toMatch(/T[123]-[A-Z]{2,5}-\d/);
      }
    }
  });
});

describe("which objectives get asked", () => {
  it("returns only the accumulated controls the pilot has questions for", () => {
    const accumulated = ["T3-IAM-01", "T3-AI-01"]; // the second has no content
    expect(objectivesFor(accumulated).map((o) => o.id)).toEqual(["T3-IAM-01"]);
    expect(withoutQuestions(accumulated)).toEqual(["T3-AI-01"]);
  });

  it("the two halves account for every accumulated control, always", () => {
    const all = OBJECTIVES.map((o) => o.id).concat(["T3-AI-01", "T3-RES-02"]);
    expect(objectivesFor(all).length + withoutQuestions(all).length).toBe(all.length);
  });
});

describe("children fire only on Yes (FR-13)", () => {
  const objective = OBJECTIVES.find((o) => o.children.length > 0)!;

  it.each(["Partial", "No", "N-A"] as const)("no children on %s", (answer) => {
    expect(childrenAsked(objective, answer, {})).toHaveLength(0);
  });

  it("no children before the parent is answered", () => {
    expect(childrenAsked(objective, null, {})).toHaveLength(0);
  });

  it("children appear on Yes", () => {
    expect(childrenAsked(objective, "Yes", {}).length).toBeGreaterThan(0);
  });

  it("a child whose cross-tier condition is unmet stays invisible", () => {
    const conditional = OBJECTIVES.flatMap((o) =>
      o.children.filter((c) => c.when).map((c) => ({ o, c })),
    )[0];
    expect(conditional, "no conditional child in the instrument to test").toBeTruthy();
    const { o, c } = conditional!;
    const without = childrenAsked(o, "Yes", {});
    expect(without.map((x) => x.id)).not.toContain(c.id);
    // Positive evidence only: it appears once the condition actually holds.
    const field = c.when![0]!.field;
    const lookup =
      "includesAny" in c.when![0]!
        ? { [field]: c.when![0]!.includesAny }
        : { [field]: (c.when![0] as { equalsAny: string[] }).equalsAny[0]! };
    expect(childrenAsked(o, "Yes", lookup).map((x) => x.id)).toContain(c.id);
  });
});

describe("notes (§3.4)", () => {
  it("Yes stands alone; everything else must be written down", () => {
    expect(noteRequired("Yes")).toBe(false);
    for (const answer of ["Partial", "No", "N-A"] as const) {
      expect(noteRequired(answer), answer).toBe(true);
    }
  });

  it("names what to write, differently for N-A", () => {
    expect(noteProblem("No", "")).toMatch(/what exists today/);
    expect(noteProblem("N-A", "")).toMatch(/why this doesn't apply/);
    expect(noteProblem("No", "  ")).toBeTruthy();
    expect(noteProblem("No", "We have none.")).toBeNull();
    expect(noteProblem("Yes", "")).toBeNull();
    expect(noteProblem(null, "")).toBeNull();
  });
});

describe("a submission is refused on the server, not by the form (FR-28's lesson)", () => {
  const objective = OBJECTIVES.find((o) => o.children.length > 0)!;

  it("passes when every non-Yes answer carries a note", () => {
    const values: Record<string, Tier3Value> = {
      [objective.questionId]: { answer: "No", note: "Nothing exists yet." },
    };
    expect(tier3SubmissionProblems([objective], values, {})).toEqual([]);
  });

  it("names the objective when a note is missing", () => {
    const values: Record<string, Tier3Value> = {
      [objective.questionId]: { answer: "Partial", note: "" },
    };
    const problems = tier3SubmissionProblems([objective], values, {});
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(objective.name);
  });

  it("checks children too, but only the ones actually asked", () => {
    const child = childrenAsked(objective, "Yes", {})[0]!;
    const values: Record<string, Tier3Value> = {
      [objective.questionId]: { answer: "Yes", note: "" },
      [child.questionId]: { answer: "No", note: "" },
    };
    expect(tier3SubmissionProblems([objective], values, {})).toHaveLength(1);

    // With the parent not Yes, that child is invisible — and an invisible
    // question cannot be incomplete.
    const suppressed: Record<string, Tier3Value> = {
      [objective.questionId]: { answer: "Partial", note: "Some of it." },
      [child.questionId]: { answer: "No", note: "" },
    };
    expect(tier3SubmissionProblems([objective], suppressed, {})).toEqual([]);
  });
});

describe("the stored shape", () => {
  it("accepts an answer with its note, and nothing else", () => {
    expect(isTier3Value({ answer: "Yes", note: "" })).toBe(true);
    expect(isTier3Value({ answer: "Maybe", note: "" })).toBe(false);
    expect(isTier3Value({ answer: "Yes" })).toBe(false);
    expect(isTier3Value("Yes")).toBe(false);
    expect(isTier3Value(null)).toBe(false);
  });
});
