/**
 * FR-50 / FR-51 · a rating is a band with its reasons, computed by the one
 * engine from rules that are data (G-78). These hold the derivation to the
 * edition and to the rules of the road: worst-of roll-up, every reason
 * kept, a step per settlement state, never a number on the way out.
 */
import { describe, expect, it } from "vitest";
import {
  appetiteBreaches,
  areaRatings,
  controlWeight,
  inherentNamespace,
  inherentRating,
  RATING,
  RATING_BANDS,
  residualNamespace,
  residualRating,
  validate,
  type RatedControl,
  type RatedFinding,
} from "@/lib/rating";
import { SEVERITY_QUESTIONS } from "@/lib/severity";

const privacy = SEVERITY_QUESTIONS.find((q) => q.path === "PRIV")!.questionId;
const provider = SEVERITY_QUESTIONS.find((q) => q.path === "TPR_LA")!.questionId;
const criticality = SEVERITY_QUESTIONS.find((q) => q.path === null)!.questionId;

describe("the edition", () => {
  it("is versioned, bands worst last, and every rule carries a reason", () => {
    expect(RATING.slug).toBe("risk-rating");
    expect(RATING.bands).toEqual([...RATING_BANDS]);
    for (const rule of [...RATING.inherent.rules, ...RATING.residual.rules]) {
      expect(rule.because.length).toBeGreaterThan(10);
    }
  });

  it("refuses an appetite line that escalates to nobody", () => {
    const clone = () => JSON.parse(JSON.stringify(RATING)) as typeof RATING;
    expect(() => validate(clone())).not.toThrow();
    const nowhere = clone();
    nowhere.appetite.push({ scope: "assessment", max: "Low", because: "a line", escalateTo: "nowhere" });
    expect(() => validate(nowhere)).toThrow(/escalates to "nowhere"/);
    const noArea = clone();
    noArea.appetite.push({ scope: "assessment", max: "Low", because: "a line", escalateTo: "domain:nope" });
    expect(() => validate(noArea)).toThrow(/escalates to "domain:nope"/);
    const toArea = clone();
    toArea.appetite.push({ scope: "assessment", max: "Low", because: "a line", escalateTo: "domain:data-privacy" });
    expect(() => validate(toArea)).not.toThrow();
  });

  it("refuses a rule with no reason, and an appetite line on a scope that is not one", () => {
    // §19 lists five refusals; three were pinned and these two were not,
    // which is one edit away from a refusal disappearing in silence
    // (verifier, second pass).
    const clone = () => JSON.parse(JSON.stringify(RATING)) as typeof RATING;
    const mute = clone();
    mute.inherent.rules[0]!.because = "   ";
    expect(() => validate(mute)).toThrow(/inherent rule 1: has no reason/);
    const muteStep = clone();
    muteStep.residual.rules[0]!.because = "";
    expect(() => validate(muteStep)).toThrow(/residual rule 1: has no reason/);
    const noSuchArea = clone();
    noSuchArea.appetite.push({ scope: "area:nope", max: "Low", because: "a line", escalateTo: "role:admin" });
    expect(() => validate(noSuchArea)).toThrow(/no such risk area/);
    const notAScope = clone();
    notAScope.appetite.push({ scope: "unit:finance", max: "Low", because: "a line", escalateTo: "role:admin" });
    expect(() => validate(notAScope)).toThrow(/scope must be "assessment" or "area:<key>"/);
  });

  it("refuses a rule whose own fields are wrong, not only its condition", () => {
    const clone = () => JSON.parse(JSON.stringify(RATING)) as typeof RATING;
    const noBand = clone();
    delete (noBand.inherent.rules[0] as { band?: string }).band;
    expect(() => validate(noBand)).toThrow(/inherent rule 1: "undefined" is not a rating band/);
    const wordStep = clone();
    (wordStep.residual.rules[0] as { step: unknown }).step = "two";
    expect(() => validate(wordStep)).toThrow(/residual rule 1: step must be a whole number of bands/);
    const noStep = clone();
    delete (noStep.residual.rules[0] as { step?: number }).step;
    expect(() => validate(noStep)).toThrow(/step must be a whole number/);
    const leap = clone();
    leap.residual.rules[0]!.step = 7;
    expect(() => validate(leap)).toThrow(/between -3 and 3 — got 7/);
    const half = clone();
    half.residual.rules[0]!.step = 0.5;
    expect(() => validate(half)).toThrow(/whole number/);
  });

  it("says Medium or higher when the rule means Medium or higher", () => {
    // The verifier's B1: a reason must be true of the record it describes.
    const medium = RATING.inherent.rules.find((r) => r.band === "Medium")!;
    expect(medium.because).toBe("at least one severity answer is Medium or higher");
  });
});

describe("the inherent rating", () => {
  it("is Low with nothing answered, and says so", () => {
    expect(inherentRating({}, {})).toEqual({ band: "Low", because: [RATING.inherent.default.because] });
  });

  it("follows the worst severity answer, keeping every reason that matched", () => {
    const medium = inherentRating({}, { [criticality]: "Medium" });
    expect(medium.band).toBe("Medium");
    const high = inherentRating({}, { [criticality]: "Medium", [provider]: "High" });
    expect(high.band).toBe("High");
    expect(high.because).toEqual(
      expect.arrayContaining(["at least one severity answer is Medium or higher", "at least one severity answer is High"]),
    );
  });

  it("reaches Critical only by a rule in the edition — two areas at High", () => {
    const ns = inherentNamespace({ [provider]: "High", [privacy]: "High" });
    expect(ns["areas.atHigh"]).toBe("2");
    const rated = inherentRating({}, { [provider]: "High", [privacy]: "High" });
    expect(rated.band).toBe("Critical");
    expect(rated.because).toContain("two or more risk areas are at High");
  });

  it("reads the assessment's own answers beside the derived ones", () => {
    // Personal data at High in an activity that uses AI.
    const rated = inherentRating({ "gate.ai": "Yes" }, { [privacy]: "High" });
    expect(rated.band).toBe("Critical");
    expect(rated.because).toContain("personal data at High severity in an activity that uses AI");
    expect(inherentRating({ "gate.ai": "No" }, { [privacy]: "High" }).band).toBe("High");
  });

  it("never emits a number", () => {
    const rated = inherentRating({}, { [provider]: "High" });
    expect(JSON.stringify(rated)).not.toMatch(/\d/);
  });
});

describe("the residual rating", () => {
  const inherent = { band: "High" as const, because: ["at least one severity answer is High"] };
  const finding = (over: Partial<RatedFinding>): RatedFinding => ({
    objective: "T3-IAM-02",
    kind: "gap",
    standing: "open",
    settlementKind: null,
    ...over,
  });
  const control = (over: Partial<RatedControl>): RatedControl => ({
    objective: "T3-IAM-02",
    questionId: "t3.t3_iam_02",
    answer: "Yes",
    attested: true,
    ...over,
  });

  it("starts from the inherent band and says so", () => {
    const rated = residualRating(inherent, { findings: [], controls: [] });
    expect(rated.band).toBe("High");
    expect(rated.because[0]).toBe("inherent rating High");
  });

  it("rises by a band for an open non-compliance, and for an open gap on a high-weight control", () => {
    expect(controlWeight("T3-IAM-02")).toBe("High");
    const breach = residualRating(inherent, { findings: [finding({ kind: "non-compliance" })], controls: [] });
    expect(breach.band).toBe("Critical");
    expect(breach.because).toContain("an answer contradicts a policy clause and nothing has settled it");
    const gap = residualRating({ band: "Medium", because: [] }, { findings: [finding({})], controls: [] });
    expect(gap.band).toBe("High");
    // A gap on an ordinary control moves nothing by itself.
    expect(residualRating({ band: "Medium", because: [] }, { findings: [finding({ objective: "T3-NB-05" })], controls: [] }).band).toBe("Medium");
  });

  it("holds under an acceptance, names it, and rises again when a fix is overdue", () => {
    const accepted = residualRating(inherent, {
      findings: [finding({ standing: "settled", settlementKind: "risk-accepted" })],
      controls: [],
    });
    expect(accepted.band).toBe("High");
    expect(accepted.because).toContain("a risk is accepted for now — the rating holds until the acceptance lapses");
    const overdue = residualRating(inherent, {
      findings: [finding({ standing: "overdue", settlementKind: "remediation" })],
      controls: [],
    });
    expect(overdue.band).toBe("Critical");
  });

  it("falls by a band only when everything required is attested and the high-weight controls are in place", () => {
    const done = residualRating(inherent, {
      findings: [],
      controls: [control({}), control({ objective: "T3-NB-05", questionId: "t3.t3_nb_05" })],
    });
    expect(done.band).toBe("Medium");
    expect(done.because).toContain("every required control is attested and the high-weight ones are in place");
    // One unattested answer, and it holds.
    const waiting = residualRating(inherent, {
      findings: [],
      controls: [control({}), control({ objective: "T3-NB-05", questionId: "t3.t3_nb_05", attested: false })],
    });
    expect(waiting.band).toBe("High");
    // A reopened acceptance is open again.
    expect(residualNamespace({ findings: [finding({ standing: "reopened", settlementKind: "risk-accepted" })], controls: [] })["findings.open.any"]).toBe("1");
  });

  it("never leaves the band scale", () => {
    const top = residualRating({ band: "Critical", because: [] }, {
      findings: [finding({ kind: "non-compliance" }), finding({ standing: "overdue", settlementKind: "remediation" })],
      controls: [],
    });
    expect(top.band).toBe("Critical");
    const bottom = residualRating({ band: "Low", because: [] }, { findings: [], controls: [control({})] });
    expect(bottom.band).toBe("Low");
  });
});

describe("appetite", () => {
  it("flags a residual Critical and says where it escalates", () => {
    const breaches = appetiteBreaches({ residual: { band: "Critical", because: [] }, areas: {} });
    expect(breaches).toHaveLength(1);
    expect(breaches[0]).toMatchObject({ scope: "assessment", label: "the assessment", max: "High", escalateTo: "role:admin" });
  });

  it("flags an area above its own line, from that area's worst severity", () => {
    const areas = areaRatings({ [privacy]: "High" });
    expect(areas["data-privacy"]?.band).toBe("High");
    const breaches = appetiteBreaches({ residual: { band: "Low", because: [] }, areas });
    expect(breaches.map((b) => b.scope)).toEqual(["area:data-privacy"]);
    // The word a screen prints, never the key.
    expect(breaches[0]!.label).not.toMatch(/area:|-/);
    expect(breaches[0]!.label.length).toBeGreaterThan(3);
  });

  it("is silent within appetite", () => {
    expect(appetiteBreaches({ residual: { band: "High", because: [] }, areas: {} })).toEqual([]);
  });
});
