/**
 * G-83 · what an activity inherits from the platforms it sits on.
 *
 * The measured problem: ten of the fifteen control questions a requester
 * faces are about the enterprise estate. These hold the rules that let a
 * platform answer them instead — and the ones that stop inheritance
 * becoming a way to launder a control failure.
 */
import { describe, expect, it } from "vitest";
import {
  PLATFORMS_QUESTION,
  inheritanceFor,
  inheritedAlready,
  inheritedAnswer,
  platformsChosen,
  relief,
  stillAskedNames,
} from "@/lib/inheritance";
import { CATEGORIES } from "@/lib/instrument";
import { SEVERITY_QUESTIONS } from "@/lib/severity";

const now = new Date("2026-09-03T12:00:00Z");
const said = (value: unknown) => ({ value, source: "person", confirmed: true });

/** Third party applies, logical access ticked, provider access High — a
 *  record that genuinely requires identity controls. */
const thirdParty = CATEGORIES.find((c) => c.key === "third-party")!;
const provider = SEVERITY_QUESTIONS.find((q) => q.path === "TPR_LA")!.questionId;
const base = {
  [thirdParty.questionId]: said("Yes"),
  [thirdParty.pathQuestion!.questionId]: said(["TPR_LA"]),
  [provider]: said("High"),
};
const on = (...platforms: string[]) => ({ ...base, [PLATFORMS_QUESTION]: said(platforms) });

describe("what an activity says it sits on", () => {
  it("reads the choice, and treats anything else as nothing", () => {
    expect(platformsChosen(on("PL_ENTRA"))).toEqual(["PL_ENTRA"]);
    expect(platformsChosen(base)).toEqual([]);
    expect(platformsChosen({ [PLATFORMS_QUESTION]: said("PL_ENTRA") })).toEqual([]);
  });

  it("ignores a platform nobody has assessed", () => {
    const result = inheritanceFor({ stored: on("PL_NOPE"), intake: {}, now });
    expect(result.chosen).toEqual([]);
    expect(result.covered).toEqual([]);
  });
});

describe("what a platform takes off the requester", () => {
  it("covers only the controls this assessment actually requires", () => {
    // Entra provides six identity controls. What matters is how many of
    // them this activity needed — listing the rest would be padding a
    // screen with reassurance.
    const none = inheritanceFor({ stored: base, intake: {}, now });
    const withIdentity = inheritanceFor({ stored: on("PL_ENTRA"), intake: {}, now });
    expect(withIdentity.covered.length).toBeGreaterThan(0);
    expect(withIdentity.covered.length).toBeLessThanOrEqual(6);
    expect(withIdentity.stillAsked.length).toBe(
      none.stillAsked.length - withIdentity.covered.length,
    );
    for (const covered of withIdentity.covered) {
      expect(none.stillAsked).toContain(covered.objective);
    }
  });

  it("names the provider, the person who attested, and when", () => {
    const result = inheritanceFor({ stored: on("PL_ENTRA"), intake: {}, now });
    const one = result.covered[0]!;
    expect(one.platformName).toBe("Microsoft Entra ID");
    expect(one.owner.length).toBeGreaterThan(3);
    expect(one.attestedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The confirmed answer carries that provenance into the record, because
    // a bare Yes would be the requester asserting something never checked.
    const answer = inheritedAnswer(one);
    expect(answer.answer).toBe("Yes");
    expect(answer.note).toContain("Microsoft Entra ID");
    expect(answer.note).toContain(one.attestedOn);
    expect(answer.note).toContain(one.owner);
  });

  it("says how much of the burden went, in words a person reads", () => {
    const result = inheritanceFor({ stored: on("PL_ENTRA"), intake: {}, now });
    expect(relief(result)).toMatch(/are provided by platforms you already sit on/);
    expect(relief(inheritanceFor({ stored: base, intake: {}, now }))).toMatch(
      /None of the \d+ controls/,
    );
    expect(stillAskedNames(result).every((n) => n.length > 3)).toBe(true);
  });
});

describe("a lapsed attestation covers nothing", () => {
  it("puts the question back and says why", () => {
    // Okta's attestation expired in August. Choosing it must not discharge
    // anything: inheritance that outlives its evidence is how a control
    // failure gets laundered.
    const result = inheritanceFor({ stored: on("PL_OKTA"), intake: {}, now });
    expect(result.chosen).toHaveLength(1);
    expect(result.lapsed).toHaveLength(1);
    expect(result.covered).toEqual([]);
    expect(result.lapsed[0]!.because).toMatch(/lapsed on .* no longer counts/);
    // And the controls it would have provided are still owed.
    const none = inheritanceFor({ stored: base, intake: {}, now });
    expect(result.stillAsked).toEqual(none.stillAsked);
  });

  it("still covers from a live platform chosen alongside a lapsed one", () => {
    const both = inheritanceFor({ stored: on("PL_OKTA", "PL_ENTRA"), intake: {}, now });
    expect(both.lapsed.map((l) => l.platform.id)).toEqual(["PL_OKTA"]);
    expect(both.covered.length).toBeGreaterThan(0);
    expect(both.covered.every((c) => c.platformName === "Microsoft Entra ID")).toBe(true);
  });
});

describe("what the platform is not cleared to hold", () => {
  it("names the mismatch between the activity and the platform", () => {
    const result = inheritanceFor({
      stored: on("PL_GH_COPILOT"),
      intake: {},
      project: {
        dataClassification: "Restricted",
        dataElements: ["Customer personal information"],
      },
      now,
    });
    expect(result.mismatches).toHaveLength(2);
    expect(result.mismatches[0]!.because).toMatch(/cleared up to Internal/);
  });

  it("is silent when the activity fits, and when nothing was asked", () => {
    expect(
      inheritanceFor({
        stored: on("PL_SNOWFLAKE"),
        intake: {},
        project: { dataClassification: "Confidential", dataElements: ["Customer personal information"] },
        now,
      }).mismatches,
    ).toEqual([]);
    expect(inheritanceFor({ stored: on("PL_GH_COPILOT"), intake: {}, now }).mismatches).toEqual([]);
  });
});

describe("an offer is not an answer", () => {
  it("only counts a control as inherited once its own answer says so", () => {
    const result = inheritanceFor({ stored: on("PL_ENTRA"), intake: {}, now });
    const one = result.covered[0]!;
    const answer = inheritedAnswer(one);

    // The recorded inherited answer, exactly.
    expect(inheritedAlready(one, answer)).toBe(true);
    // Nothing recorded yet: still asked, so the question cannot vanish.
    expect(inheritedAlready(one, undefined)).toBe(false);
    // A person's own Yes is theirs, not the platform's.
    expect(inheritedAlready(one, { answer: "Yes", note: "we already do this" })).toBe(
      false,
    );
    // Somebody who disagreed with the platform keeps their disagreement.
    expect(inheritedAlready(one, { answer: "No", note: answer.note })).toBe(false);
    // And nothing shaped like an answer at all counts as one.
    expect(inheritedAlready(one, "Yes")).toBe(false);
    expect(inheritedAlready(one, null)).toBe(false);
  });
});
