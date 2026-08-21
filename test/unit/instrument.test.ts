/**
 * The Tier-1 instrument (S2): FR-3 gates, FR-22 pre-fill, NFR-8 seed data.
 * Pure — the instrument is imported at build time, never read from disk.
 */
import { describe, expect, it } from "vitest";
import {
  askableCategories,
  gateProgressHeadline,
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
  it("an explicit third-party answer both opens and CLOSES the gate (C-1, C-2)", () => {
    const tpr = categoryByKey("third-party")!;
    expect(prefillFor(tpr, { thirdPartyInvolved: "Yes" })).toEqual({
      answer: "Yes",
      because: "you told us a company outside ours is involved",
    });
    // The half that was missing: intake could only ever open an area.
    expect(prefillFor(tpr, { thirdPartyInvolved: "No" })).toEqual({
      answer: "No",
      because: "you told us this is built and run entirely in-house",
    });
  });

  it("carries uncertainty forward as scope, and says that is what it did (C-9)", () => {
    // Intake promises "we'll find out for you" when someone is unsure. It
    // then used to ask the same question again at the gate, which is §24.1
    // broken by the platform that states it. Unsure now opens the area —
    // the conservative direction — and the reason says so plainly, so this
    // is not uncertainty laundered into a confident answer.
    for (const [key, field] of [
      ["ai", "usesAi"],
      ["third-party", "thirdPartyInvolved"],
    ] as const) {
      const filled = prefillFor(categoryByKey(key)!, { [field]: "I'm not sure" });
      expect(filled?.answer, key).toBe("Yes");
      expect(filled?.because, key).toMatch(/weren't sure|reviewer confirms/);
    }
  });

  it("an explicit No about AI closes the AI gate (C-1)", () => {
    expect(prefillFor(categoryByKey("ai")!, { usesAi: "No" })).toEqual({
      answer: "No",
      because: "you told us at intake that this doesn't use AI or machine learning",
    });
  });

  it("non-public data classification answers the data gate", () => {
    const data = categoryByKey("data-privacy")!;
    expect(prefillFor(data, { dataClassification: ["Confidential"] })?.answer).toBe("Yes");
    expect(prefillFor(data, { dataClassification: ["Public"] })).toBeNull();
  });

  it("never pre-fills from an empty intake — positive evidence only (§3.2.1)", () => {
    // A settled area is not a pre-fill: nothing was derived from an answer,
    // so it is excluded here and pinned by its own test below.
    for (const c of CATEGORIES.filter((c) => !c.alwaysApplies)) {
      expect(prefillFor(c, {}), c.key).toBeNull();
    }
  });

  it("closing pre-fills exist at all — the half the instrument was missing", () => {
    const closes = CATEGORIES.flatMap((c) => c.prefill).filter((r) => r.answer === "No");
    // Measured in audits/instrument-2026-08-21.md: five rules, none of them
    // closing, so a project with no vendor, no AI and public data was asked
    // all eleven questions. If this ever returns to zero, that is back.
    expect(closes.length).toBeGreaterThan(0);
  });
});

describe("areas that apply to everyone are not asked (C-8)", () => {
  it("governance is settled, with a reason, and carries no prefill rules", () => {
    const gov = categoryByKey("governance")!;
    expect(gov.alwaysApplies).toBe(true);
    expect(gov.because).toBeTruthy();
    expect(gov.prefill).toEqual([]);
  });

  it("is answered Yes regardless of intake, and marked settled rather than pre-filled", () => {
    const state = gateStates({}, {}).find((s) => s.category.key === "governance")!;
    expect(state.answer).toBe("Yes");
    expect(state.settled).toBe(true);
    // Not "from intake": presenting it as a pre-fill would invite a person
    // to correct something that is not theirs to correct.
    expect(state.fromIntake).toBe(false);
  });

  it("does not count as something the person still has to do", () => {
    expect(unansweredCount(gateStates({}, {}))).toBe(askableCategories().length);
    expect(askableCategories().length).toBeLessThan(CATEGORIES.length);
  });
});

describe("gate state folding", () => {
  const intake = { thirdPartyInvolved: "Yes", usesAi: "Yes" };

  it("marks intake-derived answers as unconfirmed, with their reason", () => {
    const states = gateStates({}, intake);
    const tpr = states.find((s) => s.category.key === "third-party")!;
    expect(tpr.answer).toBe("Yes");
    expect(tpr.fromIntake).toBe(true);
    expect(tpr.because).toBe("you told us a company outside ours is involved");
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
    // Ten, not eleven: governance applies to everyone and is never asked.
    expect(unansweredCount(gateStates({}, {}))).toBe(10);
    // Two pre-filled from intake still count as answered — they are visible
    // and changeable, not hidden work.
    expect(unansweredCount(gateStates({}, intake))).toBe(8);
  });

  it("an in-house project with no AI arrives with three areas already settled", () => {
    // The audit's worst case: a process change with no technology, no
    // vendor, no AI and public data was asked all eleven questions because
    // every pre-fill rule answered Yes and none answered No.
    const plain = { thirdPartyInvolved: "No", usesAi: "No" };
    const states = gateStates({}, plain);
    expect(states.filter((s) => s.answer === "No").map((s) => s.category.key)).toEqual([
      "third-party",
      "ai",
    ]);
    expect(unansweredCount(states)).toBe(8);
  });
});

describe("the progress headline tells the truth (F6)", () => {
  it("does not say 'Nearly there.' with ten of eleven areas unanswered", () => {
    expect(gateProgressHeadline(1, 11)).toBe("1 of 11 areas answered.");
  });

  it("earns encouragement only near the end", () => {
    expect(gateProgressHeadline(9, 11)).toBe("Nearly there.");
    expect(gateProgressHeadline(11, 11)).toBe("That's the whole map.");
  });

  it("invites a start rather than reporting zero", () => {
    expect(gateProgressHeadline(0, 11)).toBe("Let's map the risk areas.");
  });
});
