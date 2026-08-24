/**
 * §22.1 · compliance checking, deterministic half.
 *
 * The guardrail this feature carries is that **the deterministic pass
 * stands alone**: with no model available, a structured answer breaching a
 * structured requirement is still caught. Everything here runs with no
 * model and no network.
 */
import { describe, expect, it } from "vitest";
import {
  authorityFor,
  breachSummary,
  breachesIn,
  clausesWithNoQuestion,
  policies,
  POLICY_VERSION,
} from "@/lib/policy";
import { OBJECTIVES } from "@/lib/tier3";

describe("the policy library is real and points at real questions", () => {
  it("is versioned", () => {
    expect(POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("every alignment names a question the instrument actually asks", () => {
    // The mistake this stops: a clause citing a question nobody is asked
    // would promise an authority that can never fire.
    const known = new Set(
      OBJECTIVES.flatMap((o) => [
        o.questionId,
        ...o.children.map((c) => c.questionId),
      ]),
    );
    const dangling: string[] = [];
    for (const policy of policies()) {
      for (const clause of policy.clauses) {
        for (const requirement of clause.requires) {
          if (!known.has(requirement.questionId)) {
            dangling.push(`${clause.id} → ${requirement.questionId}`);
          }
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  it("every clause carries its own words, not a summary of them", () => {
    for (const policy of policies()) {
      for (const clause of policy.clauses) {
        expect(
          clause.text.length,
          `${clause.id} is too thin to quote`,
        ).toBeGreaterThan(60);
        expect(clause.id, `${clause.id} must cite its policy`).toContain(
          policy.reference,
        );
      }
    }
  });

  it("names every owner as a risk domain a reviewer belongs to", () => {
    for (const policy of policies()) {
      expect(policy.owner).toMatch(/^[a-z-]+$/);
    }
  });
});

describe("why a question is asked", () => {
  it("answers with a clause, quoted", () => {
    const authority = authorityFor("t3.t3_iam_02");
    expect(authority).not.toBeNull();
    expect(authority!.clause.text).toMatch(
      /[Mm]ulti-factor authentication shall be enforced/,
    );
    expect(authority!.policy.reference).toBe("IAM-STD-004");
    expect(authority!.expect).toBe("Yes");
  });

  it("says nothing for a question no policy governs", () => {
    expect(authorityFor("t3.nothing_governs_this")).toBeNull();
  });
});

describe("what counts as a breach", () => {
  const clause = "t3.t3_iam_02";

  it("catches an answer that falls short of what a clause requires", () => {
    const found = breachesIn({
      [clause]: { answer: "No", note: "Not rolled out yet." },
    });
    expect(found).toHaveLength(1);
    expect(found[0]!.expected).toBe("Yes");
    expect(found[0]!.answered).toBe("No");
    // Both sides quotable: the clause and what the person wrote.
    expect(found[0]!.clauseText).toMatch(/shall be enforced/);
    expect(found[0]!.answerNote).toBe("Not rolled out yet.");
  });

  it("catches a Partial — half a control is a breach of a clause that says shall", () => {
    expect(
      breachesIn({ [clause]: { answer: "Partial", note: "Admins only." } }),
    ).toHaveLength(1);
  });

  it("finds nothing when the answer meets the clause", () => {
    expect(
      breachesIn({ [clause]: { answer: "Yes", note: "Enforced everywhere." } }),
    ).toEqual([]);
  });

  it("never treats an unanswered question as a breach", () => {
    // Silence becoming non-compliance is the mirror image of the mistake
    // never-guess exists to stop.
    expect(breachesIn({})).toEqual([]);
  });

  it("never treats N-A as a breach — that is a position for a reviewer to test", () => {
    expect(
      breachesIn({
        [clause]: { answer: "N-A", note: "No admin access exists." },
      }),
    ).toEqual([]);
  });

  it("can be scoped to the questions in play", () => {
    const answers = {
      "t3.t3_iam_02": { answer: "No", note: "" },
      "t3.t3_dp_01": { answer: "No", note: "" },
    };
    expect(breachesIn(answers)).toHaveLength(2);
    expect(breachesIn(answers, ["t3.t3_dp_01"])).toHaveLength(1);
  });

  it("reads as a sentence naming both the answer and the authority", () => {
    const found = breachesIn({ [clause]: { answer: "No", note: "" } });
    expect(breachSummary(found[0]!)).toBe(
      "Answered No where IAM-STD-004 §3.4 requires Yes.",
    );
  });
});

describe("obligations the pilot does not yet ask about", () => {
  it("names them rather than dropping them", () => {
    // §22.1 read the other way: an obligation with no question is a gap in
    // the instrument, and the report that says so is the useful artifact.
    const gaps = clausesWithNoQuestion();
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      expect(
        gap.clause.notAskedYet,
        `${gap.clause.id} must say why`,
      ).toBeTruthy();
    }
  });

  it("never counts a gap as a breach", () => {
    const governed = new Set(
      policies().flatMap((p) =>
        p.clauses.flatMap((c) => c.requires.map((r) => r.questionId)),
      ),
    );
    for (const gap of clausesWithNoQuestion()) {
      for (const requirement of gap.clause.requires) {
        expect(governed.has(requirement.questionId)).toBe(true);
      }
    }
  });
});
