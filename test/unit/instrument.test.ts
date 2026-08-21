/**
 * The Tier-1 instrument (S2): FR-3 gates, FR-22 pre-fill, NFR-8 seed data.
 * Pure — the instrument is imported at build time, never read from disk.
 */
import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  INSTRUMENT,
  categoryByKey,
  gateStates,
  prefillFor,
  unansweredCount,
} from "../../src/lib/instrument";

describe("the instrument is valid seed data (NFR-8)", () => {
  it("has eleven categories, each with one gate and a unique question id", () => {
    expect(CATEGORIES).toHaveLength(11);
    expect(new Set(CATEGORIES.map((c) => c.questionId)).size).toBe(11);
    expect(new Set(CATEGORIES.map((c) => c.key)).size).toBe(11);
    expect(INSTRUMENT.slug).toBe("tier1-gates");
    expect(INSTRUMENT.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("every gate has plain-language help — the question text alone is dense", () => {
    for (const c of CATEGORIES) {
      expect(c.help.length, c.key).toBeGreaterThan(40);
      expect(c.help, c.key).not.toMatch(/[a-z]+\.[a-z_]{3,}/); // no identifiers
    }
  });

  it("every pre-fill rule states a reason a person can read (§24.4)", () => {
    for (const c of CATEGORIES) {
      for (const rule of c.prefill) {
        expect(["Yes", "No"]).toContain(rule.answer);
        expect(rule.because, c.key).toMatch(/^[a-z]/); // reads after "because …"
      }
    }
  });
});

describe("pre-fill from intake (FR-22)", () => {
  it("a named vendor answers the third-party gate, with its reason", () => {
    const filled = prefillFor(categoryByKey("third-party")!, { vendorNames: "Cadenza Inc" });
    expect(filled).toEqual({ answer: "Yes", because: "you named a vendor at intake" });
  });

  it("AI at intake answers the AI gate; 'I'm not sure' does not", () => {
    const ai = categoryByKey("ai")!;
    expect(prefillFor(ai, { usesAi: "Yes" })?.answer).toBe("Yes");
    // Uncertainty must not be laundered into a confident gate answer.
    expect(prefillFor(ai, { usesAi: "I'm not sure" })).toBeNull();
    expect(prefillFor(ai, { usesAi: "No" })).toBeNull();
  });

  it("non-public data classification answers the data gate", () => {
    const data = categoryByKey("data-privacy")!;
    expect(prefillFor(data, { dataClassification: ["Confidential"] })?.answer).toBe("Yes");
    expect(prefillFor(data, { dataClassification: ["Public"] })).toBeNull();
  });

  it("never pre-fills from an empty intake — positive evidence only (§3.2.1)", () => {
    for (const c of CATEGORIES) expect(prefillFor(c, {}), c.key).toBeNull();
  });
});

describe("gate state folding", () => {
  const intake = { vendorNames: "Cadenza Inc", usesAi: "Yes" };

  it("marks intake-derived answers as unconfirmed, with their reason", () => {
    const states = gateStates({}, intake);
    const tpr = states.find((s) => s.category.key === "third-party")!;
    expect(tpr.answer).toBe("Yes");
    expect(tpr.fromIntake).toBe(true);
    expect(tpr.because).toBe("you named a vendor at intake");
  });

  it("a person's answer supersedes the pre-fill and is no longer 'from intake'", () => {
    const states = gateStates(
      { "gate.third_party": { value: "No", source: "person", confirmed: true } },
      intake,
    );
    const tpr = states.find((s) => s.category.key === "third-party")!;
    expect(tpr.answer).toBe("No");
    expect(tpr.fromIntake).toBe(false);
  });

  it("counts only what the person still has to answer (§24.8)", () => {
    expect(unansweredCount(gateStates({}, {}))).toBe(11);
    // Two pre-filled from intake still count as answered — they are visible
    // and changeable, not hidden work.
    expect(unansweredCount(gateStates({}, intake))).toBe(9);
  });
});
