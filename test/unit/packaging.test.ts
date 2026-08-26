import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  blockers,
  canPackage,
  openFindingNames,
  packageFilename,
} from "@/lib/packaging";

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
      // Directly, or through the pure module that wraps it.
      if (
        !source.includes("findingIsOpen") &&
        !source.includes("openFindingNames")
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
