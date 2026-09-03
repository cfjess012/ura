/**
 * FR-52 / FR-53 · a mapping resolves at both ends, says which reading it is,
 * and coverage is computed rather than claimed.
 */
import { describe, expect, it } from "vitest";
import {
  CROSSWALK_VERSION,
  RELATIONSHIPS,
  controlsUnder,
  controlsWithoutObligation,
  coverage,
  crosswalkProblems,
  frameworkCoverage,
  frameworkRoster,
  obligationsFor,
  type Mapping,
} from "@/lib/crosswalk";
import { CONTROLS } from "@/lib/severity";
import { FRAMEWORKS } from "@/lib/frameworks";

const good: Mapping = {
  objective: "T3-IAM-02",
  framework: "nist-csf-2.0",
  ref: "PR.AA-03",
  relationship: "partial",
  because: "the framework requires authentication; multi-factor is one way of achieving it",
};

describe("a mapping has to resolve at both ends", () => {
  it("accepts one that does", () => {
    expect(crosswalkProblems([good])).toEqual([]);
  });

  it("refuses a control this instrument does not have", () => {
    expect(crosswalkProblems([{ ...good, objective: "T3-NOPE-01" }])[0]).toMatch(
      /is not a control this instrument knows/,
    );
  });

  it("refuses a framework nobody loaded, rather than inventing it", () => {
    // The whole point: an ISO mapping cannot be written here, because the
    // standard is not loaded and its clause numbers are not ours to guess.
    expect(crosswalkProblems([{ ...good, framework: "iso-27001" }])[0]).toMatch(
      /is not a loaded framework/,
    );
  });

  it("refuses a requirement the framework does not contain", () => {
    expect(crosswalkProblems([{ ...good, ref: "PR.AA-99" }])[0]).toMatch(
      /has no requirement "PR.AA-99"/,
    );
  });

  it("refuses a mapping to something the publisher withdrew", () => {
    expect(crosswalkProblems([{ ...good, ref: "ID.AM-06" }])[0]).toMatch(
      /was withdrawn by .* map to what replaced it/,
    );
  });

  it("refuses a reading that is not one of the three, and one with no reasoning", () => {
    expect(
      crosswalkProblems([{ ...good, relationship: "covers" as unknown as Mapping["relationship"] }])[0],
    ).toMatch(/is not one of equivalent, partial, supports/);
    expect(crosswalkProblems([{ ...good, because: "yes" }])[0]).toMatch(/needs a sentence saying why/);
  });

  it("refuses the same pair twice", () => {
    expect(crosswalkProblems([good, good])[0]).toMatch(/mapped twice/);
  });
});

describe("what the shipped crosswalk says", () => {
  it("is versioned, and every mapping in it resolves", () => {
    expect(CROSSWALK_VERSION).toMatch(/^control-crosswalk@\d{4}-\d{2}-\d{2}\.\d+$/);
    // The import would have thrown otherwise, but say it out loud.
    for (const framework of FRAMEWORKS) {
      for (const objective of controlsUnder(framework.id)) {
        expect(CONTROLS[objective], `${objective} is mapped but not in the catalogue`).toBeDefined();
      }
    }
  });

  it("hands a control its obligations with the published wording as the basis", () => {
    const mfa = obligationsFor("T3-IAM-02");
    expect(mfa.length).toBeGreaterThan(0);
    const csf = mfa.find((o) => o.framework === "nist-csf-2.0")!;
    expect(csf.ref).toBe("PR.AA-03");
    expect(csf.relationship).toBe("partial");
    expect(csf.quote).toBe("Users, services, and hardware are authenticated");
    expect(csf.heading).toContain("Identity Management");
  });

  it("is honest about how much is partial", () => {
    // A crosswalk claiming equivalence everywhere is flattering itself. If
    // this ever inverts, the mappings have been inflated.
    const all = FRAMEWORKS.flatMap((f) =>
      controlsUnder(f.id).flatMap((o) => obligationsFor(o).filter((x) => x.framework === f.id)),
    );
    const equivalent = all.filter((o) => o.relationship === "equivalent").length;
    expect(equivalent).toBeLessThan(all.length / 2);
    expect(RELATIONSHIPS).toHaveLength(3);
  });

  it("says nothing about a control it has not mapped", () => {
    expect(obligationsFor("T3-NOPE-01")).toEqual([]);
  });
});

describe("coverage is computed, never asserted", () => {
  it("splits a framework into what is reached and what is not", () => {
    const csf = frameworkCoverage("nist-csf-2.0")!;
    expect(csf.covered.length + csf.uncovered.length).toBe(106);
    expect(csf.covered.some((c) => c.ref === "PR.AA-03")).toBe(true);
    expect(csf.uncovered.some((c) => c.ref === "PR.AA-03")).toBe(false);
    // Withdrawn requirements are in neither half: counting them as a gap
    // would invent one the publisher has already closed.
    expect([...csf.covered, ...csf.uncovered].some((c) => c.ref === "ID.AM-06")).toBe(false);
  });

  it("names which controls reach a requirement", () => {
    const csf = frameworkCoverage("nist-csf-2.0")!;
    const entitlements = csf.covered.find((c) => c.ref === "PR.AA-05")!;
    expect(entitlements.controls.length).toBeGreaterThan(1);
    expect(entitlements.controls).toContain("T3-IAM-01");
  });

  it("covers every loaded framework, worst first", () => {
    const all = coverage();
    expect(all.map((c) => c.framework).sort()).toEqual(
      FRAMEWORKS.map((f) => f.id).sort(),
    );
    for (let i = 1; i < all.length; i += 1) {
      expect(all[i]!.covered.length).toBeGreaterThanOrEqual(all[i - 1]!.covered.length);
    }
  });

  it("returns nothing for a framework nobody loaded", () => {
    expect(frameworkCoverage("iso-27001")).toBeNull();
  });

  it("lists the controls citing no obligation at all", () => {
    const orphans = controlsWithoutObligation();
    for (const o of orphans) {
      expect(obligationsFor(o.objective)).toEqual([]);
      expect(o.name.length).toBeGreaterThan(3);
    }
    // Every mapped control is absent from that list, and every control in
    // the catalogue is in exactly one of the two.
    const mapped = Object.keys(CONTROLS).filter((id) => obligationsFor(id).length > 0);
    expect(mapped.length + orphans.length).toBe(Object.keys(CONTROLS).length);
  });
});

describe("what is not loaded is named, not hidden", () => {
  it("says which frameworks are absent and why", () => {
    const { loaded, notLoaded } = frameworkRoster();
    expect(loaded.map((f) => f.id)).toEqual(FRAMEWORKS.map((f) => f.id));
    expect(notLoaded.length).toBeGreaterThan(0);
    for (const f of notLoaded) {
      expect(f.because.length).toBeGreaterThan(20);
      expect(loaded.some((l) => l.name === f.name)).toBe(false);
    }
    // The licensed ones say so, because that is the reason a reader needs.
    expect(notLoaded.filter((f) => /licensed/.test(f.because)).length).toBeGreaterThanOrEqual(3);
  });
});
