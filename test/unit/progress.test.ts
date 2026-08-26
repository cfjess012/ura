/**
 * Where an assessment has got to, said in the requester's terms.
 *
 * This exists because the requester's list carried no state at all: nine
 * drafts, nine rows reading "edited today", nothing saying which of them was
 * one field from done and which was empty. Everything asserted here is a
 * claim the list makes on screen, so it has to be true of the record.
 */
import { describe, expect, it } from "vitest";
import { ownStanding, STEPS } from "@/lib/progress";
import type { IntakeValues } from "@/lib/intake";
import type { ReviewCounts } from "@/lib/review-standing";

const COMPLETE: IntakeValues = {
  projectName: "Cadenza",
  projectDescription: "Scheduling tool for shifts.",
  usesAi: "No",
  businessOwner: "d.chen",
  initiativeType: "Brand new",
  businessUnit: "BU_OPS",
  thirdPartyInvolved: "No",
  dataClassification: "Internal",
};

const NONE: ReviewCounts = {
  answeredIds: [],
  attestedIds: [],
  openGaps: [],
  openEnhancements: [],
  openViolations: [],
  declaredGaps: 0,
};

const draft = (intake: IntakeValues, answers = {}) =>
  ownStanding({ submittedAt: null, intake, answers, counts: null });

describe("step 1 — the identity record", () => {
  it("names the section to open, not just a total", () => {
    // "8 answers still needed" is the count FR-14 objected to: nobody can
    // act on it, and it hides which screen to go to.
    const standing = draft({});
    expect(standing.step).toBe(1);
    expect(standing.stepLabel).toBe(STEPS[0]);
    expect(standing.turn).toBe("you");
    expect(standing.says).toMatch(/Description/);
  });

  it("says the whole total AND the part in the next section", () => {
    const standing = draft({ projectName: "Cadenza" });
    expect(standing.says).toMatch(/7 answers needed — 2 of them in Description/);
  });

  it("drops the second half once one section owes everything", () => {
    const standing = draft({ ...COMPLETE, dataClassification: "" });
    expect(standing.says).toBe("1 answer needed in Compliance & Data");
  });

  it("carries a meter, because the identity record's total never moves", () => {
    const standing = draft({});
    expect(standing.meter?.total).toBeGreaterThan(0);
    expect(standing.meter?.done).toBe(0);
  });
});

describe("step 2 — the risk areas", () => {
  it("is reached only once the identity record is complete", () => {
    // The risk areas reason FROM intake. Reporting step 2 over a half-filled
    // record would send somebody to a screen that redirects them back.
    expect(draft(COMPLETE).step).toBe(2);
    expect(draft(COMPLETE).stepLabel).toBe(STEPS[1]);
  });

  it("names the risk areas first, because nothing downstream exists yet", () => {
    expect(draft(COMPLETE).says).toMatch(/risk areas? still to answer/);
  });

  it("shows no meter at all", () => {
    // Answering a gate Yes OPENS questions, so a fraction here would fall as
    // a person works — a claim the numbers do not support (§24.9).
    expect(draft(COMPLETE).meter).toBeNull();
  });

  it("is still the requester's move", () => {
    expect(draft(COMPLETE).turn).toBe("you");
  });
});

describe("steps 3 and 4 — once it has been sent", () => {
  const sent = (counts: ReviewCounts | null) =>
    ownStanding({
      submittedAt: new Date("2026-08-20T09:00:00Z"),
      intake: COMPLETE,
      answers: {},
      counts,
    });

  it("does not read as finished before anything has been recorded", () => {
    // "0 of 0 answers signed" is technically true and reads as done.
    const standing = sent(NONE);
    expect(standing.step).toBe(3);
    expect(standing.says).toMatch(/nothing is signed yet/);
    expect(standing.meter).toBeNull();
  });

  it("counts signatures against answers, and says so", () => {
    const standing = sent({
      ...NONE,
      answeredIds: ["t3.a", "t3.b", "t3.c"],
      attestedIds: ["t3.a"],
    });
    expect(standing.says).toBe("1 of 3 answers signed by a Risk Assessor");
    expect(standing.meter).toEqual({ done: 1, total: 3, label: "signed" });
    expect(standing.turn).toBe("reviewer");
  });

  it("never counts a signature against a question nobody answered", () => {
    // An attestation row for a question no longer answered would push the
    // fraction past its own denominator and read as more than complete.
    const standing = sent({
      ...NONE,
      answeredIds: ["t3.a", "t3.b"],
      attestedIds: ["t3.a", "t3.gone"],
    });
    expect(standing.says).toBe("1 of 2 answers signed by a Risk Assessor");
    expect(standing.meter).toEqual({ done: 1, total: 2, label: "signed" });
  });

  it("stays in review while a finding is open, even fully signed", () => {
    const standing = sent({
      ...NONE,
      answeredIds: ["t3.a"],
      attestedIds: ["t3.a"],
      openGaps: ["o.1"],
      openViolations: ["o.2"],
    });
    expect(standing.step).toBe(3);
    expect(standing.says).toMatch(/2 findings still to settle/);
  });

  it("reaches step 4 only when everything is signed and settled", () => {
    const standing = sent({
      ...NONE,
      answeredIds: ["t3.a"],
      attestedIds: ["t3.a"],
    });
    expect(standing.step).toBe(4);
    expect(standing.stepLabel).toBe(STEPS[3]);
    expect(standing.turn).toBe("settled");
  });

  it("is never the requester's move once submitted", () => {
    // A submitted assessment is read-only to them. Filing it under "needs
    // you" would tell somebody to do work they are refused.
    for (const counts of [null, NONE])
      expect(sent(counts).turn).not.toBe("you");
  });
});

describe("the four steps are one vocabulary", () => {
  it("uses the same names the project header shows (§24.6)", () => {
    expect([...STEPS]).toEqual([
      "Tell us about it",
      "Assess",
      "Review & attest",
      "Package",
    ]);
  });
});
