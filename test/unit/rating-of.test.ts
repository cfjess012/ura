/**
 * FR-50 · one assessment, rated from its record — the composition every
 * screen and the package share.
 */
import { describe, expect, it } from "vitest";
import { rateAssessment, severitiesOf } from "@/lib/rating-of";
import { RATING_EDITION } from "@/lib/rating";
import { CATEGORIES } from "@/lib/instrument";
import { accumulatedFor, SEVERITY_QUESTIONS } from "@/lib/severity";
import { objectivesFor } from "@/lib/tier3";

const provider = SEVERITY_QUESTIONS.find((q) => q.path === "TPR_LA")!.questionId;
const thirdParty = CATEGORIES.find((c) => c.key === "third-party")!;
const mfa = objectivesFor(["T3-IAM-02"])[0]!;

const said = (value: unknown, source = "person", confirmed = true) => ({ value, source, confirmed });
const now = new Date("2026-09-03T12:00:00Z");

/**
 * Every risk area answered — No everywhere except what a case ticks on top.
 * Without this a fixture leaves risk areas open, and since G-81 an open
 * assessment is provisional rather than rated, which is the point.
 */
const allGatesAnswered = Object.fromEntries(
  CATEGORIES.filter((c) => !c.alwaysApplies).map((c) => [c.questionId, said("No")]),
);
/** Every severity question answered Low. Only the asked ones are read. */
const allSeverityLow = Object.fromEntries(
  SEVERITY_QUESTIONS.map((q) => [q.questionId, said("Low")]),
);
/** A complete record: nothing outstanding anywhere. */
const complete = { ...allGatesAnswered, ...allSeverityLow };

/** Third party applies with logical access, provider access High. */
const stored = {
  ...complete,
  [thirdParty.questionId]: said("Yes"),
  [thirdParty.pathQuestion!.questionId]: said(["TPR_LA"]),
  [provider]: said("High"),
  [mfa.questionId]: said({ answer: "No", note: "not yet" }),
};

/** The third-party gate and its logical-access part, ticked — what lights the provider question. */
const lit = { [thirdParty.questionId]: said("Yes"), [thirdParty.pathQuestion!.questionId]: said(["TPR_LA"]) };

describe("what counts as a severity", () => {
  it("takes a band a person set and ignores a proposal", () => {
    expect(severitiesOf({ ...lit, [provider]: said("High") }, {})).toEqual({ [provider]: "High" });
    expect(severitiesOf({ ...lit, [provider]: said("High", "drafted", false) }, {})).toEqual({});
  });

  it("drops a word that is not on the scale, so it can never reach a chip", () => {
    expect(severitiesOf({ ...lit, [provider]: said("Extreme") }, {})).toEqual({});
    expect(severitiesOf({ ...lit, [provider]: said(["High"]) }, {})).toEqual({});
  });

  it("reads only the questions the assessment is asking — an unticked part takes its answer with it", () => {
    // The answer stays on record; the question is no longer asked, so the
    // rating no longer reads it (§19, verifier S15-B2).
    const unticked = { ...complete, ...lit, [thirdParty.pathQuestion!.questionId]: said([]), [provider]: said("High") };
    // The provider answer is on record and no longer read; the questions
    // this assessment still asks are.
    expect(severitiesOf(unticked, {})[provider]).toBeUndefined();
    const rated = rateAssessment({ stored: unticked, intake: {}, findings: [], dispositions: [], attestations: [], now });
    expect(rated.inherent.band).toBe("Low");
    // The area still has the questions its derived parts ask, and they are
    // Low. What must not happen is the unticked High leaking back into it.
    expect(rated.areas["third-party"]?.band).toBe("Low");
    // And the whole area said not to apply.
    const gateNo = { ...unticked, [thirdParty.questionId]: said("No") };
    expect(rateAssessment({ stored: gateNo, intake: {}, findings: [], dispositions: [], attestations: [], now }).inherent.band).toBe("Low");
  });
});

describe("rating an assessment from its record", () => {
  it("reads the inherent from the bands and names the edition", () => {
    const rated = rateAssessment({ stored, intake: {}, findings: [], dispositions: [], attestations: [], now });
    expect(rated.inherent.band).toBe("High");
    expect(rated.edition).toBe(RATING_EDITION);
    expect(rated.edition).toBe("risk-rating@2026-09-03.6");
    expect(rated.areas["third-party"]?.band).toBe("High");
  });

  it("names an open gap on a high-weight control without exceeding the inherent band, and holds under a live acceptance", () => {
    const finding = { id: "f1", objective: mfa.id, kind: "gap" as const };
    const open = rateAssessment({ stored, intake: {}, findings: [finding], dispositions: [], attestations: [], now });
    expect(open.residual.band).toBe("High");
    expect(open.residual.because).toContain("a high-weight control is not in place and nothing has settled it");
    const accepted = rateAssessment({
      stored,
      intake: {},
      findings: [finding],
      dispositions: [{ findingId: "f1", kind: "risk-accepted", expiresAt: new Date("2027-01-01"), remediationDue: null }],
      attestations: [],
      now,
    });
    expect(accepted.residual.band).toBe("High");
    expect(accepted.residual.because).toContain("a risk is accepted for now — the acceptance is recorded and does not lower the rating, and it lapses on its date");
  });

  it("reopens with the acceptance, and takes the newest settlement", () => {
    const finding = { id: "f1", objective: mfa.id, kind: "gap" as const };
    const lapsed = rateAssessment({
      stored,
      intake: {},
      findings: [finding],
      dispositions: [{ findingId: "f1", kind: "risk-accepted", expiresAt: new Date("2026-01-01"), remediationDue: null }],
      attestations: [],
      now,
    });
    expect(lapsed.residual.band).toBe("High");
    // The lapsed acceptance is open again, so it is named as a reason and
    // the acceptance line is gone.
    expect(lapsed.residual.because).toContain("a high-weight control is not in place and nothing has settled it");
    expect(lapsed.residual.because).not.toContain("a risk is accepted for now — the acceptance is recorded and does not lower the rating, and it lapses on its date");
    const reSettled = rateAssessment({
      stored,
      intake: {},
      findings: [finding],
      dispositions: [
        { findingId: "f1", kind: "remediation", expiresAt: null, remediationDue: new Date("2027-01-01") },
        { findingId: "f1", kind: "risk-accepted", expiresAt: new Date("2026-01-01"), remediationDue: null },
      ],
      attestations: [],
      now,
    });
    expect(reSettled.residual.band).toBe("High");
  });

  it("reads the attested answer, not the submitted one, when a reviewer corrected it", () => {
    // Every control the answers require, signed — the MFA "No" corrected
    // to Yes by the reviewer, the rest approved as they stand.
    const required = objectivesFor(accumulatedFor(stored, {}).map((c) => c.objective));
    const attestations = required.map((o) =>
      o.id === mfa.id
        ? { questionId: o.questionId, act: "correct", correctedAnswer: "Yes" }
        : { questionId: o.questionId, act: "approve", correctedAnswer: null },
    );
    const rated = rateAssessment({ stored, intake: {}, findings: [], dispositions: [], attestations, now });
    expect(rated.residual.band).toBe("Medium");
    expect(rated.residual.because).toContain("every required control is attested, and the high-weight ones are in place or none applies here");
    // One signature short, and it holds at the inherent band.
    const short = rateAssessment({ stored, intake: {}, findings: [], dispositions: [], attestations: attestations.slice(1), now });
    expect(short.residual.band).toBe("High");
  });

  it("flags appetite on the assessment and on an area", () => {
    // Two areas at High reaches Critical, which is above the line the
    // edition draws for an assessment. A finding can no longer put it there:
    // the residual cannot exceed the inherent band (G-79).
    // The security area has to be lit for its answer to count at all — the
    // rating reads only what the assessment is asking.
    const security = CATEGORIES.find((c) => c.key === "security-resilience")!;
    const exposure = SEVERITY_QUESTIONS.find((q) => q.path === "SR_EXT")!.questionId;
    const wide = {
      ...stored,
      [security.questionId]: said("Yes"),
      [security.pathQuestion!.questionId]: said(["SR_EXT"]),
      [exposure]: said("High"),
    };
    const rated = rateAssessment({ stored: wide, intake: {}, findings: [], dispositions: [], attestations: [], now });
    expect(rated.inherent.band).toBe("Critical");
    expect(rated.residual.band).toBe("Critical");
    expect(rated.breaches.map((b) => b.scope)).toContain("assessment");
  });
});
