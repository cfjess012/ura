/**
 * Review rubric (S8, G-61) — mechanical band assignment.
 *
 * Salvaged with its tests (G-8's rule: bring the tests). The three honesty
 * rules the original pinned are kept, because they are what make the band
 * trustworthy rather than decorative:
 *
 *   1. An absent answer is ungraded — it is not a weak answer.
 *   2. Floors force "verify closely" regardless of points.
 *   3. Three-valued logic: unknown is not a failure.
 *
 * And one this product adds: the band may never gate an attestation.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BAND_ORDER, reviewRubric, type ReviewInput } from "@/lib/grounding";

const base: ReviewInput = {
  answer: "Yes",
  note: "",
  wasHandedOff: false,
  timesAnswered: 1,
  childrenUnanswered: 0,
  draftedWithEvidence: null,
};
const band = (over: Partial<ReviewInput>) => reviewRubric({ ...base, ...over })!.band;

describe("what is not graded", () => {
  it("an unanswered question is absent, not weak", () => {
    expect(reviewRubric({ ...base, timesAnswered: 0 })).toBeNull();
  });
});

describe("the floors — these beat any score", () => {
  it("an N-A with no real justification must be looked at", () => {
    // "Does not apply" is a claim, and the justification is the claim.
    expect(band({ answer: "N-A", note: "n/a" })).toBe("verify-closely");
    expect(band({ answer: "N-A", note: "Handled centrally by the platform team." })).not.toBe(
      "verify-closely",
    );
  });

  it("an answer changed repeatedly means the person was unsure", () => {
    expect(band({ timesAnswered: 4 })).toBe("verify-closely");
  });

  it("a Yes with its detail left blank is a hollow Yes", () => {
    expect(band({ answer: "Yes", childrenUnanswered: 3 })).toBe("verify-closely");
  });
});

describe("the score", () => {
  it("a clean Yes with its detail filled in is routine", () => {
    expect(band({})).toBe("routine");
  });

  it("a handed-off answer never reaches routine", () => {
    // Somebody could not answer it. That is worth a reviewer's eye.
    expect(band({ wasHandedOff: true })).not.toBe("routine");
  });

  it("a gap explained properly is worth a look, not an alarm", () => {
    expect(band({ answer: "No", note: "No recertification process exists today." })).toBe(
      "worth-a-look",
    );
  });

  it("a gap with a shrug for a note falls further", () => {
    expect(band({ answer: "No", note: "no" })).toBe("verify-closely");
  });
});

describe("three-valued logic — unknown is not a failure", () => {
  it("no drafting layer yet means the criterion is unknowable, not failed", () => {
    const result = reviewRubric(base)!;
    const drafted = result.criteria.find((c) => c.id === "drafted")!;
    expect(drafted.pass).toBeNull();
    expect(drafted.detail).toMatch(/nothing drafts answers yet/i);
    // And it does not drag the band down.
    expect(result.band).toBe("routine");
  });

  it("a note criterion is unweighable on a Yes", () => {
    expect(reviewRubric(base)!.criteria.find((c) => c.id === "note")!.pass).toBeNull();
  });

  it("evidence lifts an answer once drafting exists", () => {
    expect(band({ answer: "No", note: "no", draftedWithEvidence: true })).not.toBe("routine");
    expect(band({ answer: "Partial", note: "Only for admins today.", draftedWithEvidence: true })).toBe(
      "routine",
    );
  });
});

describe("every criterion carries a receipt a person can read", () => {
  it("says why, in words, never a code", () => {
    for (const over of [{}, { answer: "No" as const, note: "x" }, { wasHandedOff: true }]) {
      for (const criterion of reviewRubric({ ...base, ...over })!.criteria) {
        expect(criterion.detail.length, criterion.id).toBeGreaterThan(15);
        expect(criterion.detail, criterion.id).not.toMatch(/T3-|[A-Z]{3,5}-\d/);
        expect(criterion.label.length, criterion.id).toBeGreaterThan(10);
      }
    }
  });
});

describe("the band orders the queue and nothing else", () => {
  it("what needs a person most comes first", () => {
    expect(BAND_ORDER["verify-closely"]).toBeLessThan(BAND_ORDER["worth-a-look"]);
    expect(BAND_ORDER["worth-a-look"]).toBeLessThan(BAND_ORDER.routine);
  });

  it("nothing in the rubric decides whether an answer may be attested", () => {
    // §5.5: every answer needs its human. A band that could gate would be a
    // machine approving work, one step removed.
    const source = readFileSync(join(__dirname, "..", "..", "src", "lib", "grounding.ts"), "utf8");
    expect(source).not.toMatch(/mayAttest|attest\(/);
  });
});
