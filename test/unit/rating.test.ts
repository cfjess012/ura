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
  FULLY_ANSWERED,
  RATING_BANDS,
  residualNamespace,
  residualRating,
  validate,
  type RatedControl,
  type RatedFinding,
} from "@/lib/rating";
import { SEVERITY_QUESTIONS } from "@/lib/severity";

/** A record with nothing outstanding — the ordinary case these tests describe. */
const whole = FULLY_ANSWERED;
const inherentOf = (
  assessment: Parameters<typeof inherentRating>[0],
  severities: Parameters<typeof inherentRating>[1],
) => inherentRating(assessment, severities, whole);
const residualOf = (
  inherent: Parameters<typeof residualRating>[0],
  input: { findings: RatedFinding[]; controls: RatedControl[] },
) => residualRating(inherent, { ...input, coverage: whole });
/** A band that stands on a complete record. */
const rated = (band: "Low" | "Medium" | "High" | "Critical", because: string[] = []) => ({
  band,
  because,
  standing: "rated" as const,
});

const privacy = SEVERITY_QUESTIONS.find((q) => q.path === "PRIV")!.questionId;
const provider = SEVERITY_QUESTIONS.find((q) => q.path === "TPR_LA")!.questionId;
const activity = SEVERITY_QUESTIONS.filter((q) => q.path === null).map((q) => q.questionId);
const criticality = activity[0]!;

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
    leap.residual.rules[0]!.step = -7;
    expect(() => validate(leap)).toThrow(/between -3 and 0/);
    // The structural guarantee behind G-79: no edition can raise a residual.
    const raises = clone();
    raises.residual.rules[0]!.step = 1;
    expect(() => validate(raises)).toThrow(/may never exceed its inherent band/);
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
  it("is Low when everything is answered and nothing rates higher", () => {
    expect(inherentOf({}, {})).toEqual({
      band: "Low",
      because: [RATING.inherent.default.because],
      standing: "rated",
    });
  });

  it("has no band at all when nothing that could rate it has been answered", () => {
    // The defect this replaced: an assessment nobody had answered fell to
    // the default band and read as Low on the reviewer's queue. Absence of
    // an answer is not evidence of a low one (G-81).
    const nothing = inherentRating({}, {}, { areasUnanswered: 7, partsUnnarrowed: 0, severityAsked: 6, severityAnswered: 0 });
    expect(nothing.band).toBeNull();
    expect(nothing.standing).toBe("unrated");
    expect(nothing.because).toEqual([RATING.notYetRated.inherent]);
    expect(JSON.stringify(nothing)).not.toMatch(/Low/);
  });

  it("is provisional, and says so, once a rule fires on an incomplete record", () => {
    const partial = { areasUnanswered: 7, partsUnnarrowed: 0, severityAsked: 6, severityAnswered: 0 };
    const floor = inherentRating({ "gate.ai": "Yes", dataElements: ["Applicant personal information"] }, {}, partial);
    expect(floor.band).toBe("High");
    expect(floor.standing).toBe("provisional");
    expect(floor.because).toContain(
      "information about identifiable people is used in an activity that involves AI",
    );
    expect(floor.because).toContain(RATING.notYetRated.provisional);
  });

  it("reads the profile, not the single worst answer, and keeps every reason that matched", () => {
    const medium = inherentOf({}, { [criticality]: "Medium" });
    expect(medium.band).toBe("Medium");
    const high = inherentOf({}, { [criticality]: "Medium", [provider]: "High" });
    expect(high.band).toBe("High");
    expect(high.because).toEqual(
      expect.arrayContaining(["at least one severity answer is Medium or higher", "a whole risk area sits at High"]),
    );
  });

  it("does not let one answer outside every risk area carry the assessment (G-79)", () => {
    // Business criticality, breadth and audience are asked of everyone and
    // belong to no area. Under the first edition a single High here made the
    // whole assessment High, which is how a max-of rule collapses as the
    // instrument grows: every question added raises the chance that one of
    // them is High. The unit of judgement is now the risk area.
    const alone = inherentOf({}, { [criticality]: "High" });
    expect(alone.band).toBe("Medium");
    expect(alone.because).not.toContain("a whole risk area sits at High");
  });

  it("reaches High on breadth alone — two areas elevated, neither at High", () => {
    const wide = inherentOf({}, { [provider]: "Medium", [privacy]: "Medium" });
    expect(wide.band).toBe("High");
    expect(wide.because).toContain("two or more risk areas are elevated");
  });

  it("lets the activity's own profile carry the band, on corroboration not on one answer", () => {
    // Business criticality, breadth and audience are asked of everyone and
    // belong to no risk area. One High among them is a single signal and
    // stays Medium; two is a consequence profile and reaches High. Without
    // this an activity that is business-critical, enterprise-wide and
    // customer-facing rated Medium, and consequence is first-class in
    // ISO 31000 and COSO.
    const one = inherentOf({}, { [activity[0]!]: "High" });
    expect(one.band).toBe("Medium");
    const two = inherentOf({}, { [activity[0]!]: "High", [activity[1]!]: "High" });
    expect(two.band).toBe("High");
    expect(two.because).toContain(
      "the activity is High on two or more of how critical it is, how widely it is deployed and who can reach it",
    );
    const ns = inherentNamespace({ [activity[0]!]: "High", [activity[1]!]: "High", [activity[2]!]: "Medium" });
    expect(ns["activity.atHigh"]).toBe("2");
    expect(ns["activity.severity"]).toBe("High");
    // The activity never counts as a risk area.
    expect(ns["areas.atHigh"]).toBe("0");
  });

  it("reaches Critical when a severe activity also has a risk area at High", () => {
    const rated = inherentOf({}, { [activity[0]!]: "High", [activity[1]!]: "High", [provider]: "High" });
    expect(rated.band).toBe("Critical");
    expect(rated.because).toContain("a risk area at High in an activity that is itself High on two or more counts");
  });

  it("reaches Critical only by a rule in the edition — two areas at High", () => {
    const ns = inherentNamespace({ [provider]: "High", [privacy]: "High" });
    expect(ns["areas.atHigh"]).toBe("2");
    const rated = inherentOf({}, { [provider]: "High", [privacy]: "High" });
    expect(rated.band).toBe("Critical");
    expect(rated.because).toContain("two or more risk areas are at High");
  });

  it("reads the assessment's own answers beside the derived ones", () => {
    // Personal data at High in an activity that uses AI.
    const rated = inherentOf({ "gate.ai": "Yes" }, { [privacy]: "High" });
    expect(rated.band).toBe("Critical");
    expect(rated.because).toContain("personal data at High severity in an activity that uses AI");
    expect(inherentOf({ "gate.ai": "No" }, { [privacy]: "High" }).band).toBe("High");
  });

  it("never emits a number", () => {
    const rated = inherentOf({}, { [provider]: "High" });
    expect(JSON.stringify(rated)).not.toMatch(/\d/);
  });
});

describe("the residual rating", () => {
  const inherent = rated("High", ["a whole risk area sits at High"]);
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
    const rated = residualOf(inherent, { findings: [], controls: [] });
    expect(rated.band).toBe("High");
    expect(rated.because[0]).toBe("inherent rating High");
  });

  it("does not hand a reduction to an assessment that required no control", () => {
    // Nothing open and nothing attested is not a clean control environment,
    // it is an absence of evidence — and it was earning a band.
    const nothing = residualOf(inherent, { findings: [], controls: [] });
    expect(nothing.band).toBe("High");
    expect(nothing.because).toHaveLength(1);
  });

  it("never exceeds the inherent band, whatever is open against it (G-79)", () => {
    // Controls reduce risk; they do not create it. An open finding says the
    // control environment earns nothing back, not that the activity became
    // more dangerous than it is before any control exists.
    expect(controlWeight("T3-IAM-02")).toBe("High");
    const breach = residualOf(inherent, { findings: [finding({ kind: "non-compliance" })], controls: [] });
    expect(breach.band).toBe("High");
    expect(breach.because).toContain("an answer contradicts a policy clause and nothing has settled it");
    const gap = residualOf(rated("Medium", []), { findings: [finding({})], controls: [] });
    expect(gap.band).toBe("Medium");
    expect(gap.because).toContain("a high-weight control is not in place and nothing has settled it");
    // Every step in the edition is zero or negative, so no edition can raise one.
    for (const step of RATING.residual.rules) expect(step.step).toBeLessThanOrEqual(0);
  });

  it("holds under an acceptance, names it, and stays held when a fix is overdue", () => {
    const accepted = residualOf(inherent, {
      findings: [finding({ standing: "settled", settlementKind: "risk-accepted" })],
      controls: [],
    });
    expect(accepted.band).toBe("High");
    expect(accepted.because).toContain("a risk is accepted for now — the acceptance is recorded and does not lower the rating, and it lapses on its date");
    const overdue = residualOf(inherent, {
      findings: [finding({ standing: "overdue", settlementKind: "remediation" })],
      controls: [],
    });
    expect(overdue.band).toBe("High");
    expect(overdue.because).toContain("a promised fix is past its date");
  });

  it("falls by a band only when everything required is attested and the high-weight controls are in place", () => {
    const done = residualOf(inherent, {
      findings: [],
      controls: [control({}), control({ objective: "T3-NB-05", questionId: "t3.t3_nb_05" })],
    });
    expect(done.band).toBe("Medium");
    expect(done.because).toContain("every required control is attested, and the high-weight ones are in place or none applies here");
    // One unattested answer, and it holds.
    const waiting = residualOf(inherent, {
      findings: [],
      controls: [control({}), control({ objective: "T3-NB-05", questionId: "t3.t3_nb_05", attested: false })],
    });
    expect(waiting.band).toBe("High");
    // An overdue fix stops the fall outright, rather than cancelling it
    // silently against a step in the other direction (verifier N1).
    const late = residualOf(inherent, {
      findings: [finding({ standing: "overdue", settlementKind: "remediation" })],
      controls: [control({}), control({ objective: "T3-NB-05", questionId: "t3.t3_nb_05" })],
    });
    expect(late.band).toBe("High");
    expect(late.because).not.toContain("every required control is attested, and the high-weight ones are in place or none applies here");
    // And an activity that requires none of the high-weight controls can
    // still earn its reduction, which the first edition made impossible.
    const noneHeavy = residualOf(inherent, {
      findings: [],
      controls: [control({ objective: "T3-NB-05", questionId: "t3.t3_nb_05" })],
    });
    expect(noneHeavy.band).toBe("Medium");
    // A reopened acceptance is open again.
    expect(residualNamespace({ findings: [finding({ standing: "reopened", settlementKind: "risk-accepted" })], controls: [] })["findings.open.any"]).toBe("1");
  });

  it("does not let a promised fix earn what only a made one should", () => {
    // A remediation inside its date is a plan: the gap is acknowledged and
    // nothing has changed on the ground. The reviewer releases it by
    // settling the finding again once the fix is real.
    const promised = residualOf(inherent, {
      findings: [finding({ standing: "settled", settlementKind: "remediation" })],
      controls: [control({})],
    });
    expect(promised.band).toBe("High");
    expect(promised.because).toContain("a fix is promised but not yet made, so nothing is earned back");
    // Settled another way — the answer was corrected — and the fall is earned.
    const done = residualOf(inherent, {
      findings: [finding({ standing: "settled", settlementKind: "answer-corrected" })],
      controls: [control({})],
    });
    expect(done.band).toBe("Medium");
  });

  it("says why nothing was earned back while a control waits for a signature", () => {
    // The commonest state in a live review, and the second edition left the
    // screen silent about it (delta verification, S4).
    const waiting = residualOf(inherent, {
      findings: [],
      controls: [control({}), control({ objective: "T3-NB-05", questionId: "t3.t3_nb_05", attested: false })],
    });
    expect(waiting.band).toBe("High");
    expect(waiting.because).toContain("a required control has not been signed off yet, so nothing is earned back");
  });

  it("treats a high-weight control ruled Not applicable as one that does not apply", () => {
    // A reviewer's N-A is the formal way to say a control does not apply
    // here; counting it as required left the assessment unable to improve
    // (delta verification, S3).
    const na = residualOf(inherent, {
      findings: [],
      controls: [control({ answer: "N-A" }), control({ objective: "T3-NB-05", questionId: "t3.t3_nb_05" })],
    });
    expect(na.band).toBe("Medium");
    expect(na.because).toContain("every required control is attested, and the high-weight ones are in place or none applies here");
  });

  it("does not claim the rating held when it fell", () => {
    // A live acceptance is settled, so it never blocks the reduction; the
    // old sentence printed "the rating holds" directly above the reason it
    // had just fallen (delta verification, S5).
    const both = residualOf(inherent, {
      findings: [finding({ standing: "settled", settlementKind: "risk-accepted" })],
      controls: [control({})],
    });
    expect(both.band).toBe("Medium");
    expect(both.because).toContain("a risk is accepted for now — the acceptance is recorded and does not lower the rating, and it lapses on its date");
    expect(JSON.stringify(both.because)).not.toContain("the rating holds until");
  });

  it("never leaves the band scale", () => {
    const top = residualOf(rated("Critical", []), {
      findings: [finding({ kind: "non-compliance" }), finding({ standing: "overdue", settlementKind: "remediation" })],
      controls: [],
    });
    expect(top.band).toBe("Critical");
    // The ceiling is the inherent band, not the top of the scale.
    expect(residualOf(rated("Low", []), { findings: [finding({ kind: "non-compliance" })], controls: [] }).band).toBe("Low");
    const bottom = residualOf(rated("Low", []), { findings: [], controls: [control({})] });
    expect(bottom.band).toBe("Low");
  });
});

describe("appetite", () => {
  it("flags a residual Critical and says where it escalates", () => {
    const breaches = appetiteBreaches({ residual: rated("Critical", []), areas: {} });
    expect(breaches).toHaveLength(1);
    expect(breaches[0]).toMatchObject({ scope: "assessment", label: "the assessment", max: "High", escalateTo: "role:admin" });
  });

  it("flags an area above its own line, from that area's worst severity", () => {
    const areas = areaRatings({ [privacy]: "High" });
    expect(areas["data-privacy"]?.band).toBe("High");
    const breaches = appetiteBreaches({ residual: rated("Low", []), areas });
    expect(breaches.map((b) => b.scope)).toEqual(["area:data-privacy"]);
    // The word a screen prints, never the key.
    expect(breaches[0]!.label).not.toMatch(/area:|-/);
    expect(breaches[0]!.label.length).toBeGreaterThan(3);
  });

  it("is silent within appetite", () => {
    expect(appetiteBreaches({ residual: rated("High", []), areas: {} })).toEqual([]);
  });
});
