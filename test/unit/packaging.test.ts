import { describe, expect, it } from "vitest";
import { blockers, canPackage, packageFilename } from "@/lib/packaging";

const READY = {
  submitted: true,
  required: ["t3.a", "t3.b"],
  attested: ["t3.a", "t3.b"],
  openFindings: 0,
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

  it("refuses an open finding", () => {
    const stops = blockers({ ...READY, openFindings: 2 });
    expect(stops[0].kind).toBe("open-finding");
    expect(stops[0].says).toMatch(/2 findings are still open/);
  });

  it("names one cause rather than three symptoms of it", () => {
    // An unsubmitted assessment has nothing attested and no findings — and
    // listing all three reads as three problems when there is one.
    const stops = blockers({
      submitted: false,
      required: ["t3.a"],
      attested: [],
      openFindings: 0,
    });
    expect(stops).toHaveLength(1);
    expect(stops[0].kind).toBe("not-submitted");
  });

  it("sends each blocker somewhere the work can be done", () => {
    for (const stop of blockers({ ...READY, attested: [], openFindings: 1 })) {
      expect(stop.href).toMatch(/^\/(review|submit)$/);
    }
  });

  it("counts the outstanding, not the total", () => {
    const stops = blockers({
      ...READY,
      required: ["a", "b", "c", "d"],
      attested: ["a", "b"],
    });
    expect(stops[0].count).toBe(2);
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
