import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assemblePackage,
  blockers,
  canPackage,
  editionsPinned,
  openFindingNames,
  packageFilename,
} from "@/lib/packaging";
import { RATING_EDITION } from "@/lib/rating";
import type { Rating } from "@/lib/rating-of";

const READY = {
  submitted: true,
  required: [
    { questionId: "t3.a", label: "Multi-Factor Authentication" },
    { questionId: "t3.b", label: "Privileged Access Management" },
  ],
  attested: ["t3.a", "t3.b"],
  openFindings: [] as string[],
};

describe("what stands between an assessment and a package", () => {
  it("lets a finished assessment through", () => {
    expect(blockers(READY)).toEqual([]);
    expect(canPackage(READY)).toBe(true);
  });

  it("refuses an answer nobody signed, and says how many", () => {
    // The package claims a named person checked each answer. Assembling one
    // over an unattested answer makes that claim on somebody's behalf.
    const stops = blockers({ ...READY, attested: ["t3.a"] });
    expect(stops).toHaveLength(1);
    expect(stops[0].kind).toBe("unattested");
    expect(stops[0].count).toBe(1);
    expect(stops[0].says).toMatch(/1 control answer has not been attested/);
  });

  it("names the questions, because a count is not something you can act on", () => {
    // §19 requires the refusal name questions by text. It said "4 control
    // answers have not been attested" and stopped — sending somebody back
    // to a queue to work out which four, which is the product's job.
    const stops = blockers({ ...READY, attested: [] });
    expect(stops[0].names).toEqual([
      "Multi-Factor Authentication",
      "Privileged Access Management",
    ]);
    expect(stops[0].says).toContain("Multi-Factor Authentication");
    expect(stops[0].says).toContain("Privileged Access Management");
  });

  it("cuts a long list rather than making a wall of one sentence", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      questionId: `t3.${i}`,
      label: `Control ${i}`,
    }));
    const stops = blockers({ ...READY, required: many, attested: [] });
    // Every name is still carried — the screen lists them all. Only the
    // sentence is cut.
    expect(stops[0].names).toHaveLength(7);
    expect(stops[0].says).toContain("and 3 more");
  });

  it("refuses an open finding", () => {
    const stops = blockers({
      ...READY,
      openFindings: ["Access Review & Recertification", "Remote Access"],
    });
    expect(stops[0].kind).toBe("open-finding");
    expect(stops[0].says).toMatch(/2 findings are still open/);
    expect(stops[0].says).toContain("Access Review & Recertification");
  });

  it("names one cause rather than three symptoms of it", () => {
    // An unsubmitted assessment has nothing attested and no findings — and
    // listing all three reads as three problems when there is one.
    const stops = blockers({
      submitted: false,
      required: [{ questionId: "t3.a", label: "Multi-Factor Authentication" }],
      attested: [],
      openFindings: [],
    });
    expect(stops).toHaveLength(1);
    expect(stops[0].kind).toBe("not-submitted");
  });

  it("sends each blocker somewhere the work can be done", () => {
    for (const stop of blockers({
      ...READY,
      attested: [],
      openFindings: ["Remote Access"],
    })) {
      expect(stop.href).toMatch(/^\/(review|submit)$/);
    }
  });

  it("counts the outstanding, not the total", () => {
    const stops = blockers({
      ...READY,
      required: ["a", "b", "c", "d"].map((id) => ({
        questionId: id,
        label: id.toUpperCase(),
      })),
      attested: ["a", "b"],
    });
    expect(stops[0].count).toBe(2);
  });
});

/**
 * The defect this suite exists to stop, and the reason it is here rather
 * than beside the action: the gate decided "open" for itself, inside an
 * impure server action no unit test could reach.
 */
describe("which findings are open — the one rule, not a second one", () => {
  const now = new Date("2026-08-26T12:00:00Z");
  const past = new Date("2026-08-16T00:00:00Z");
  const future = new Date("2026-12-01T00:00:00Z");
  const FINDINGS = [
    { id: "f1", objectiveName: "Multi-Factor Authentication" },
    { id: "f2", objectiveName: "Remote Access" },
  ];
  const settled = (rows: Array<[string, string, Date | null]>) =>
    new Map(rows.map(([id, kind, expiresAt]) => [id, { kind, expiresAt }]));

  it("an undisposed finding is open", () => {
    expect(openFindingNames(FINDINGS, settled([]), now)).toEqual([
      "Multi-Factor Authentication",
      "Remote Access",
    ]);
  });

  it("a settled finding is not", () => {
    const rows = settled([
      ["f1", "remediation", null],
      ["f2", "answer-corrected", null],
    ]);
    expect(openFindingNames(FINDINGS, rows, now)).toEqual([]);
  });

  it("AN EXPIRED ACCEPTANCE IS OPEN, and it blocks packaging", () => {
    // The shipped bug. A disposition row existed, so the gate called it
    // settled and packaged — while the review queue, asking the one rule,
    // flagged the same finding as breaching policy at the same moment.
    const rows = settled([["f1", "risk-accepted", past]]);
    expect(openFindingNames(FINDINGS, rows, now)).toContain(
      "Multi-Factor Authentication",
    );
    const stops = blockers({
      ...READY,
      openFindings: openFindingNames(FINDINGS, rows, now),
    });
    expect(stops.some((s) => s.kind === "open-finding")).toBe(true);
    expect(canPackage({ ...READY, openFindings: openFindingNames(FINDINGS, rows, now) })).toBe(false);
  });

  it("a live acceptance is not open", () => {
    const rows = settled([
      ["f1", "risk-accepted", future],
      ["f2", "remediation", null],
    ]);
    expect(openFindingNames(FINDINGS, rows, now)).toEqual([]);
  });

  it("an acceptance with no expiry is open — that is a closure wearing a date", () => {
    const rows = settled([["f1", "risk-accepted", null]]);
    expect(openFindingNames(FINDINGS, rows, now)).toContain(
      "Multi-Factor Authentication",
    );
  });
});

/**
 * Provenance has to survive the instrument moving — that is the only
 * moment it matters. It read the *currently activated* editions, which is
 * the right answer right up until somebody publishes a new one, and then
 * the record silently starts claiming it was asked by questions it was
 * never asked by.
 */
describe("which instrument editions actually asked these questions", () => {
  // Newest-first, as the query returns them.
  it("names the edition each answer pinned", () => {
    expect(
      editionsPinned([
        { questionId: "q1", versionId: "v1" },
        { questionId: "q2", versionId: "v1" },
      ]),
    ).toEqual(["v1"]);
  });

  it("a re-answer under a new edition supersedes the old one", () => {
    // q1 was answered under v1, then answered again under v2. Only the v2
    // answer is in the package, so only v2 asked anything that is in it.
    const pinned = editionsPinned([
      { questionId: "q1", versionId: "v2" },
      { questionId: "q1", versionId: "v1" },
    ]);
    expect(pinned).toEqual(["v2"]);
    expect(pinned).not.toContain("v1");
  });

  it("an assessment answered across a boundary names both", () => {
    // The case a map keyed by slug could not represent, which is why the
    // payload carries a list.
    expect(
      editionsPinned([
        { questionId: "q2", versionId: "v2" },
        { questionId: "q1", versionId: "v1" },
      ]).sort(),
    ).toEqual(["v1", "v2"]);
  });

  it("does not depend on what is active now — only on what was pinned", () => {
    // Nothing here can see the activation table, which is the point: a
    // newly published v3 cannot change this answer.
    expect(editionsPinned([{ questionId: "q1", versionId: "v1" }])).toEqual([
      "v1",
    ]);
  });

  it("an assessment with no answers pins nothing", () => {
    expect(editionsPinned([])).toEqual([]);
  });
});

/**
 * A rule, not advice (§26 idiom). The gate did not disagree with the queue
 * because somebody misread §4.3 — it disagreed because a second caller read
 * the same rows and drew its own conclusion. Anything that reads
 * dispositions is deciding what "open" means, so it has to ask the one
 * function that owns it.
 */
describe("nothing decides 'open' for itself", () => {
  const SRC = join(__dirname, "..", "..", "src");
  const filesUnder = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) filesUnder(full, out);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
  };

  it("every reader of dispositionsFor reaches findingIsOpen", () => {
    const offenders: string[] = [];
    let readers = 0;
    for (const file of filesUnder(SRC)) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("dispositionsFor(")) continue;
      if (file.endsWith("repo-review.ts")) continue; // it is the store itself
      readers += 1;
      // Directly, or through a pure function that wraps it — findingStanding
      // is findingIsOpen with one more word (S13).
      if (
        !source.includes("findingIsOpen") &&
        !source.includes("openFindingNames") &&
        !source.includes("findingStanding") &&
        // rateAssessment reaches findingStanding for every finding (S15).
        !source.includes("rateAssessment")
      ) {
        offenders.push(file.slice(SRC.length + 1));
      }
    }
    // The rule is only worth what it covers: if nothing reads dispositions
    // any more, this test has quietly stopped checking anything.
    expect(readers).toBeGreaterThan(1);
    expect(offenders).toEqual([]);
  });
});

describe("the downloaded filename", () => {
  it("is dated and slugged, so four in a folder are distinguishable", () => {
    expect(
      packageFilename(
        "Meridian contract intelligence",
        new Date("2026-08-25T12:00:00Z"),
      ),
    ).toBe("meridian-contract-intelligence-2026-08-25.json");
  });

  it("survives a name with nothing usable in it", () => {
    expect(packageFilename("///", new Date("2026-01-02T00:00:00Z"))).toBe(
      "assessment-2026-01-02.json",
    );
  });
});

/**
 * The frozen rating in the payload — untestable until `assemble` left the
 * server action, which is why it reached six screens and an export with no
 * test at any tier (S15 delta verification).
 */
describe("the rating a package freezes", () => {
  const rating: Rating = {
    inherent: { band: "Critical", because: ["two or more risk areas are at High"] },
    residual: { band: "Critical", because: ["inherent rating Critical", "a required control has not been signed off yet, so nothing is earned back"] },
    areas: { "data-privacy": { band: "High", because: ["the worst severity answer in this area is High"] } },
    breaches: [
      { scope: "assessment", label: "the assessment", band: "Critical", max: "High", because: "a Critical residual rating is outside the stated appetite", escalateTo: "role:admin" },
      { scope: "area:data-privacy", label: "Data & privacy", band: "High", max: "Medium", because: "personal data above Medium needs the privacy office", escalateTo: "domain:data-privacy" },
    ],
    edition: RATING_EDITION,
  };
  const payload = () =>
    assemblePackage({
      project: { id: "p1", projectName: "Sable claims triage", submittedAt: new Date("2026-09-01"), submittedBy: "u1" },
      intake: {},
      stored: {},
      required: [],
      recorded: [],
      rating,
      latest: new Map(),
      findings: [],
      settlements: new Map(),
      everyone: [{ id: "u1", name: "Isabelle Withers" }],
      by: "Alex Security",
      now: new Date("2026-09-03T12:00:00Z"),
      instrumentVersions: [{ slug: "tier1-gates", version: "2026-08-21.7" }],
    });

  it("carries both bands with every reason, and never a number", () => {
    const p = payload();
    expect(p.rating.inherent).toEqual(rating.inherent);
    expect(p.rating.residual.band).toBe("Critical");
    expect(p.rating.residual.because).toContain("a required control has not been signed off yet, so nothing is earned back");
    expect(JSON.stringify({ i: p.rating.inherent, r: p.rating.residual })).not.toMatch(/\d/);
  });

  it("keeps where each breach escalates, and names the scope in words", () => {
    // A replayable record has to say who the breach went to, not only that
    // one happened; and no export prints an internal key (NFR-9).
    const breaches = payload().rating.exceedsAppetite;
    expect(breaches).toHaveLength(2);
    expect(breaches.map((b) => b.label)).toEqual(["the assessment", "Data & privacy"]);
    expect(breaches.map((b) => b.escalateTo)).toEqual(["role:admin", "domain:data-privacy"]);
    expect(breaches[1]).toMatchObject({ band: "High", max: "Medium" });
  });

  it("carries each attested control's external obligations, with the edition read from", () => {
    // A crosswalk shown only on a screen has recorded nothing. An auditor
    // reading the export a year later needs the edition the mapping was
    // made against, not just the reference.
    const p = assemblePackage({
      project: { id: "p1", projectName: "Sable", submittedAt: new Date("2026-09-01"), submittedBy: "u1" },
      intake: {},
      stored: { "t3.t3_iam_02": { value: { answer: "Yes", note: "" } } },
      required: [{ id: "T3-IAM-02", questionId: "t3.t3_iam_02", name: "Multi-Factor Authentication" }],
      recorded: [],
      rating,
      latest: new Map([[
        "t3.t3_iam_02",
        { act: "approve", note: "seen", attestedBy: "u1", attestedAt: new Date("2026-09-02"), correctedAnswer: null },
      ]]),
      findings: [],
      settlements: new Map(),
      everyone: [{ id: "u1", name: "Isabelle Withers" }],
      by: "Alex Security",
      now: new Date("2026-09-03T12:00:00Z"),
      instrumentVersions: [],
    });
    const answer = p.answers.find((a) => a.objective === "T3-IAM-02")!;
    expect(answer.frameworks.length).toBeGreaterThan(0);
    const csf = answer.frameworks.find((f) => f.ref === "PR.AA-03")!;
    expect(csf.framework).toBe("NIST Cybersecurity Framework");
    expect(csf.edition).toBe("2.0");
    expect(csf.relationship).toBe("partial");
    expect(csf.because.length).toBeGreaterThan(20);
    // And the crosswalk's own edition sits beside the instrument's.
    expect(p.provenance.instrumentVersions.map((v) => v.slug)).toContain("control-crosswalk");
  });

  it("names the edition whose rules produced it, in the provenance a replayer reads", () => {
    const p = payload();
    expect(p.rating.edition).toBe(RATING_EDITION);
    expect(p.provenance.instrumentVersions).toContainEqual({ slug: "risk-rating", version: RATING_EDITION.split("@")[1] });
  });
});
