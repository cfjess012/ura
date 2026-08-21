/**
 * S4 — Tier 2. The §19 acceptance criteria for severity and control
 * accumulation, written as tests before the layer is called done.
 */
import { describe, expect, it } from "vitest";
import {
  SEVERITY_QUESTIONS,
  accumulateControls,
  conditionSentence,
  contradictions,
  deriveBand,
  detailFires,
  severityAtLeast,
  severityQuestionsFor,
  type SeverityQuestion,
} from "../../src/lib/severity";

const byId = (id: string) => SEVERITY_QUESTIONS.find((q) => q.id === id)!;

describe("FR-6 · rubric anchors ARE the options", () => {
  it("every band on every question carries an observable anchor", () => {
    // A band labelled only "Medium" is a bare word, and two assessors read
    // a bare word differently. The anchor is what makes them comparable.
    for (const q of SEVERITY_QUESTIONS) {
      for (const band of ["Low", "Medium", "High"] as const) {
        expect(q.bands[band]?.length, `${q.id} ${band}`).toBeGreaterThan(10);
      }
    }
  });

  it("uses the owner's own wording, not a paraphrase", () => {
    expect(byId("T2-TPR-LA-1").bands.High).toBe(
      "Privileged / admin access to production and/or broad access across environments",
    );
    expect(byId("T2-SH-1").bands.High).toContain("0–72 hours");
  });

  it("asks only what the lit paths call for", () => {
    const asked = severityQuestionsFor(["TPR_LA"]).map((q) => q.id);
    expect(asked).toContain("T2-TPR-LA-1");
    expect(asked).not.toContain("T2-AI-DEC-1");
    // The always-asked few come regardless.
    expect(asked).toContain("T2-SH-1");
  });
});

describe("§19 · unknown severity fails closed", () => {
  it("severityAtLeast(unknown, Medium) is false", () => {
    expect(severityAtLeast(null, "Medium")).toBe(false);
    expect(severityAtLeast(undefined, "Low")).toBe(false);
  });

  it("compares bands as an order, not as strings", () => {
    expect(severityAtLeast("High", "Medium")).toBe(true);
    expect(severityAtLeast("Medium", "Medium")).toBe(true);
    expect(severityAtLeast("Low", "Medium")).toBe(false);
  });

  it("an unanswered question requires nothing at all", () => {
    expect(accumulateControls([byId("T2-TPR-LA-1")], {}, {})).toEqual([]);
  });
});

describe("§19 · control accumulation", () => {
  const q = byId("T2-TPR-LA-1");

  it("Medium accumulates Low and Medium thresholds, never High", () => {
    const owed = accumulateControls([q], { [q.questionId]: "Medium" }, {}).map((c) => c.objective);
    const highOnly = q.requires.filter((r) => r.atLeast === "High").map((r) => r.objective);
    expect(owed.length).toBeGreaterThan(0);
    for (const objective of highOnly) expect(owed).not.toContain(objective);
    for (const r of q.requires.filter((x) => x.atLeast !== "High"))
      expect(owed).toContain(r.objective);
  });

  it("High accumulates everything Medium did, and more", () => {
    const medium = accumulateControls([q], { [q.questionId]: "Medium" }, {}).map((c) => c.objective);
    const high = accumulateControls([q], { [q.questionId]: "High" }, {}).map((c) => c.objective);
    for (const objective of medium) expect(high).toContain(objective);
    expect(high.length).toBeGreaterThan(medium.length);
  });

  it("every accumulated objective carries at least one human-readable reason", () => {
    const owed = accumulateControls([q], { [q.questionId]: "High" }, {});
    for (const control of owed) {
      expect(control.because.length).toBeGreaterThan(0);
      for (const why of control.because) {
        expect(why).not.toMatch(/T[23]-[A-Z]/); // no identifiers in a reason
        expect(why.length).toBeGreaterThan(15);
      }
    }
  });

  it("keeps BOTH reasons when two questions require the same control", () => {
    const a = byId("T2-TPR-LA-1");
    const b = byId("T2-SR-PAM-1");
    const shared = a.requires
      .map((r) => r.objective)
      .filter((o) => b.requires.some((r) => r.objective === o));
    expect(shared.length, "expected these two to share a control").toBeGreaterThan(0);
    const owed = accumulateControls(
      [a, b],
      { [a.questionId]: "High", [b.questionId]: "High" },
      {},
    );
    const both = owed.find((c) => c.objective === shared[0])!;
    expect(both.because.length).toBe(2);
  });
});

describe("FR-8 · the four kinds of conditional", () => {
  const q = byId("T2-TPR-LA-1");

  it("severity-fired: the detail appears at Medium and High, not at Low", () => {
    expect(detailFires(q, "Low")).toBe(false);
    expect(detailFires(q, "Medium")).toBe(true);
    expect(detailFires(q, "High")).toBe(true);
  });

  it("unanswered fires nothing", () => {
    expect(detailFires(q, null)).toBe(false);
  });

  it("nested: an option inside the detail requires controls of its own", () => {
    const owed = accumulateControls(
      [q],
      { [q.questionId]: "High" },
      { [q.detail!.questionId]: ["Admin / privileged"] },
    );
    const pam = owed.find((c) => c.objective === "T3-IAM-03")!;
    expect(pam.because.some((w) => w.includes("Admin / privileged"))).toBe(true);
  });

  it("cross-tier: a Tier-1 path decides whether the question is asked at all", () => {
    expect(severityQuestionsFor([]).some((x) => x.id === "T2-TPR-LA-1")).toBe(false);
    expect(severityQuestionsFor(["TPR_LA"]).some((x) => x.id === "T2-TPR-LA-1")).toBe(true);
  });

  it("always-fired: the shared questions are asked whatever is lit", () => {
    const always = SEVERITY_QUESTIONS.filter((x) => x.path === null);
    expect(always.length).toBeGreaterThan(1);
    for (const x of always) expect(severityQuestionsFor([]).map((y) => y.id)).toContain(x.id);
  });
});

describe("FR-7 · a band worked out rather than asked", () => {
  it("derives the data-handling band from the classification already given", () => {
    const q = byId("T2-TPR-DH-1");
    expect(deriveBand(q, { dataClassification: "Restricted" })).toEqual({
      band: "High",
      because: "you told us the most sensitive data involved is Restricted",
    });
    expect(deriveBand(q, { dataClassification: "Internal" })?.band).toBe("Low");
  });

  it("takes the worst thing in a list, not the first", () => {
    const q = byId("T2-PRIV-1");
    const derived = deriveBand(q, {
      dataElements: ["Partner/Vendor contact personal information", "Employee personal information"],
    })!;
    expect(derived.band).toBe("Medium");
  });

  it("derives nothing from an unanswered fact — positive evidence only", () => {
    expect(deriveBand(byId("T2-TPR-DH-1"), {})).toBeNull();
    expect(deriveBand(byId("T2-SH-1"), { dataClassification: "High" })).toBeNull();
  });
});

describe("§19 · a condition renders as one English sentence (FR-5)", () => {
  const label = (f: string) => (f === "usesAi" ? "Does this use AI or machine learning?" : f);

  it("names the question and the human option labels, never identifiers", () => {
    expect(conditionSentence({ field: "usesAi", equalsAny: ["Yes"] }, label)).toBe(
      "Does this use AI or machine learning? is “Yes”",
    );
  });

  it("reads as English with more than one option", () => {
    expect(
      conditionSentence({ field: "dataClassification", equalsAny: ["Internal", "Confidential", "Restricted"] }),
    ).toBe("dataClassification is “Internal”, “Confidential” or “Restricted”");
  });

  it("renders membership and presence differently", () => {
    expect(conditionSentence({ field: "paths", includesAny: ["PRIV"] })).toContain("includes");
    expect(conditionSentence({ field: "vendorNames", hasValue: true })).toBe(
      "vendorNames has been answered",
    );
  });
});

describe("§19 · the contradiction lint (structural half)", () => {
  it("flags conditions on one field that can never both hold", () => {
    expect(
      contradictions([
        { field: "usesAi", equalsAny: ["Yes"] },
        { field: "usesAi", equalsAny: ["No"] },
      ]),
    ).toHaveLength(1);
  });

  it("leaves satisfiable pairs alone", () => {
    expect(
      contradictions([
        { field: "usesAi", equalsAny: ["Yes"] },
        { field: "usesAi", equalsAny: ["Yes", "I'm not sure"] },
      ]),
    ).toEqual([]);
    expect(
      contradictions([
        { field: "usesAi", equalsAny: ["Yes"] },
        { field: "dataClassification", equalsAny: ["Public"] },
      ]),
    ).toEqual([]);
  });

  it("finds no contradiction in the shipped instrument", () => {
    for (const q of SEVERITY_QUESTIONS as SeverityQuestion[]) {
      expect(contradictions([]), q.id).toEqual([]);
    }
  });
});
