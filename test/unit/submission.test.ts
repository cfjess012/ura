/**
 * S7 · Submission, declaration and findings (FR-14, FR-15, FR-37).
 *
 * A wrong rule here becomes a wrong finding a reviewer acts on, or a
 * declaration that describes a record which no longer exists.
 */
import { describe, expect, it } from "vitest";
import {
  editableAfter,
  findingKindFor,
  gapsIn,
  stageOf,
  submissionProblem,
  synthesiseFindings,
} from "@/lib/submission";
import { OBJECTIVES, childrenAsked, type Tier3Value } from "@/lib/tier3";

const objective = OBJECTIVES.find((o) => o.children.length > 0)!;
const child = childrenAsked(objective, "Yes", {})[0]!;
const val = (answer: Tier3Value["answer"], note = ""): Tier3Value => ({
  answer,
  note,
});

describe("what becomes a finding (§4.3)", () => {
  it("No is a gap and Partial is an enhancement", () => {
    expect(findingKindFor("No")).toBe("gap");
    expect(findingKindFor("Partial")).toBe("enhancement");
  });

  it("Yes and N-A produce nothing", () => {
    // Yes is the control existing. N-A is a justified claim that it does not
    // apply — the justification is the reviewer's to test at S8, not a
    // finding against the activity.
    expect(findingKindFor("Yes")).toBeNull();
    expect(findingKindFor("N-A")).toBeNull();
  });

  it("a No creates exactly one finding, carrying its note (§19)", () => {
    const found = synthesiseFindings(
      [objective],
      { [objective.questionId]: val("No", "Nothing exists yet.") },
      {},
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      objective: objective.id,
      objectiveName: objective.name,
      note: "Nothing exists yet.",
    });
  });

  it("a No on a policy-governed control is a non-compliance, carrying the clause", () => {
    // One fact, one finding. Raising a bare gap AND a breach would report
    // the same thing twice and tell the reviewer nothing extra — so where a
    // policy governs the question, the breach IS the finding, and it
    // carries the authority a gap could not.
    const found = synthesiseFindings(
      [objective],
      { [objective.questionId]: val("No", "Nothing exists yet.") },
      {},
    );
    expect(found[0]!.kind).toBe("non-compliance");
    expect(found[0]!.citation?.policyRef).toBe("IAM-STD-004");
    expect(found[0]!.citation?.expected).toBe("Yes");
    expect(found[0]!.citation?.clauseText).toMatch(/documented business need/);
  });

  it("children under a Yes parent produce findings of their own", () => {
    const found = synthesiseFindings(
      [objective],
      {
        [objective.questionId]: val("Yes"),
        [child.questionId]: val("Partial", "Only for admins."),
      },
      {},
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: "enhancement",
      note: "Only for admins.",
    });
  });

  it("a child whose parent is not Yes was never asked, so it is not a finding", () => {
    // An old answer to a suppressed question is history, not a gap — the
    // same rule that makes it unanswerable in the first place (§3.4).
    const found = synthesiseFindings(
      [objective],
      {
        [objective.questionId]: val("N-A", "Handled centrally."),
        [child.questionId]: val("No", "stale answer from before"),
      },
      {},
    );
    expect(found).toEqual([]);
  });
});

describe("gaps are named, not counted (FR-14)", () => {
  it("an unanswered objective is named in its own words", () => {
    const gaps = gapsIn([objective], {}, {});
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.label).toBe(objective.text);
    expect(gaps[0]!.label).not.toMatch(/T3-[A-Z]/);
  });

  it("a revealed child that is unanswered is a gap too", () => {
    const gaps = gapsIn(
      [objective],
      { [objective.questionId]: val("Yes") },
      {},
    );
    expect(gaps.map((g) => g.questionId)).toContain(child.questionId);
  });

  it("a suppressed child is not a gap — it was never asked", () => {
    const gaps = gapsIn(
      [objective],
      { [objective.questionId]: val("No", "none") },
      {},
    );
    expect(gaps).toEqual([]);
  });
});

describe("what stops a submission", () => {
  const base = {
    alreadySubmitted: false,
    declaredCount: 8,
    expectedCount: 8,
    gapsAcknowledged: false,
    gapCount: 0,
  };

  it("lets a complete, declared assessment through", () => {
    expect(submissionProblem(base)).toBeNull();
  });

  it("refuses a second submission — it is a one-way act (§4.1)", () => {
    expect(submissionProblem({ ...base, alreadySubmitted: true })).toMatch(
      /already been submitted/,
    );
  });

  it("refuses when the answers shown are not the answers on record", () => {
    // The declaration is about what the person READ. If that changed under
    // them, their confirmation describes something else.
    expect(submissionProblem({ ...base, declaredCount: 7 })).toMatch(
      /have changed/,
    );
  });

  it("allows gaps, but only once they are confirmed by name", () => {
    expect(submissionProblem({ ...base, gapCount: 3 })).toMatch(
      /3 questions are unanswered/,
    );
    expect(
      submissionProblem({ ...base, gapCount: 3, gapsAcknowledged: true }),
    ).toBeNull();
    expect(submissionProblem({ ...base, gapCount: 1 })).toMatch(
      /1 question is unanswered/,
    );
  });

  it("refuses before there is anything to declare", () => {
    expect(
      submissionProblem({ ...base, declaredCount: 0, expectedCount: 0 }),
    ).toMatch(/complete the intake/);
  });
});

describe("submission is a one-way fact, not a status (§4.1)", () => {
  it("the stage is read from the timestamp", () => {
    expect(stageOf(null)).toBe("Draft");
    expect(stageOf(new Date())).toBe("In review");
  });

  it("a submitted assessment is closed to its requester", () => {
    // An answer changed after submission would make the declaration
    // describe a record that no longer exists.
    expect(editableAfter(null)).toBe(true);
    expect(editableAfter(new Date())).toBe(false);
  });
});
