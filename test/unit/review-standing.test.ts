import { describe, expect, it } from "vitest";
import { needsReviewer, reviewStanding } from "@/lib/review-standing";
import type { ReviewCounts } from "@/lib/review-standing";

const NONE: ReviewCounts = {
  answeredIds: [],
  attestedIds: [],
  openGaps: [],
  openEnhancements: [],
  openViolations: [],
  declaredGaps: 0,
};

describe("what a submitted assessment is still waiting for", () => {
  it("counts only what this reader may sign", () => {
    // The defect this exists to stop: an alert told an assessor four
    // control answers were waiting for them when every one belonged to
    // another risk area. They opened the queue, found each control greyed
    // out, and the honest conclusion was that the product was broken.
    const counts = {
      ...NONE,
      answeredIds: ["t3.mine", "t3.theirs", "t3.also-theirs"],
    };
    const standing = reviewStanding("p1", counts, (id) => id === "t3.mine");
    const attest = standing.find((s) => s.kind === "attest");
    expect(attest?.count).toBe(1);
    expect(attest?.label).toContain("1 control answer");
  });

  it("names the rest as somebody else's rather than adding them in", () => {
    const counts = { ...NONE, answeredIds: ["t3.mine", "t3.theirs"] };
    const standing = reviewStanding("p1", counts, (id) => id === "t3.mine");
    const elsewhere = standing.find((s) => s.kind === "elsewhere");
    expect(elsewhere?.count).toBe(1);
    expect(elsewhere?.label).toContain("other risk domains");
  });

  it("scopes findings to the domain that owns the control", () => {
    const counts = {
      ...NONE,
      openViolations: ["obj.mine", "obj.theirs"],
      openGaps: ["obj.theirs"],
    };
    const standing = reviewStanding(
      "p1",
      counts,
      () => true,
      (id) => id === "obj.mine",
    );
    expect(standing.find((s) => s.kind === "violation")?.count).toBe(1);
    expect(standing.find((s) => s.kind === "gap")).toBeUndefined();
  });

  it("puts a policy violation above a gap, and a gap above an enhancement", () => {
    // A violation cites a clause the organisation wrote down. It is not the
    // same kind of claim as "this could be better".
    const counts = {
      ...NONE,
      answeredIds: ["t3.a"],
      openViolations: ["v"],
      openGaps: ["g"],
      openEnhancements: ["e"],
      declaredGaps: 2,
    };
    expect(reviewStanding("p1", counts).map((s) => s.kind)).toEqual([
      "attest",
      "violation",
      "gap",
      "enhancement",
      "unanswered",
    ]);
  });

  it("does not call an assessment mine when only another domain owes work", () => {
    const counts = { ...NONE, answeredIds: ["t3.theirs"] };
    expect(
      needsReviewer(
        counts,
        () => false,
        () => false,
      ),
    ).toBe(false);
    expect(
      needsReviewer(
        counts,
        () => true,
        () => true,
      ),
    ).toBe(true);
  });

  it("does not treat declared gaps as work a reviewer can clear", () => {
    // The requester already said so on purpose (FR-14). An alert nobody can
    // clear is an alert people learn to ignore.
    expect(needsReviewer({ ...NONE, declaredGaps: 9 })).toBe(false);
    expect(reviewStanding("p1", { ...NONE, declaredGaps: 9 })).toHaveLength(1);
  });

  it("says nothing is outstanding when nothing is", () => {
    const counts = { ...NONE, answeredIds: ["t3.a"], attestedIds: ["t3.a"] };
    expect(reviewStanding("p1", counts)).toEqual([]);
    expect(needsReviewer(counts)).toBe(false);
  });
});
