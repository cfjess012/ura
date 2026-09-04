/**
 * G-83 · who can answer a control, and what a platform provides.
 *
 * The measured problem behind these: ten of the fifteen control questions a
 * requester faces are about the enterprise estate. These hold the two rules
 * that fix it — a control says who can answer it, and a platform may only
 * provide what is centrally providable.
 */
import { describe, expect, it } from "vitest";
import {
  PROVISIONS,
  PROVISION_VERSION,
  controlsWhere,
  isProvidable,
  provisionOf,
  provisionProblems,
  provisionTally,
  type ControlProvision,
} from "@/lib/control-provision";
import {
  PLATFORMS,
  PLATFORMS_VERSION,
  dataMismatches,
  platformById,
  platformProblems,
  platformRoster,
  providedBy,
  stale,
  type Platform,
} from "@/lib/platforms";
import { CONTROLS } from "@/lib/severity";

const now = new Date("2026-09-03T12:00:00Z");
const clonePlatform = (id: string): Platform => JSON.parse(JSON.stringify(platformById(id))) as Platform;

describe("who can answer a control", () => {
  it("classifies every control in the catalogue, once", () => {
    expect(PROVISION_VERSION).toMatch(/^control-provision@/);
    const tally = provisionTally();
    expect(tally.common + tally.hybrid + tally["system-specific"]).toBe(
      Object.keys(CONTROLS).length,
    );
    // The split is the argument: the identity family is nobody's project to
    // decide, and every AI and privacy control is the activity's own.
    for (const objective of ["T3-IAM-02", "T3-IAM-03", "T3-LOG-01"]) {
      expect(provisionOf(objective)?.provision, objective).toBe("common");
    }
    for (const objective of ["T3-AI-02", "T3-PRIV-02", "T3-TPR-01"]) {
      expect(provisionOf(objective)?.provision, objective).toBe("system-specific");
    }
    expect(provisionOf("T3-DP-01")?.provision).toBe("hybrid");
  });

  it("refuses a classification that leaves a control unclassified", () => {
    // A control nobody classified would silently keep being asked of the
    // wrong person, which is the failure this file exists to end.
    const short = controlsWhere("common").slice(0, 3);
    const problems = provisionProblems(short);
    expect(problems.length).toBeGreaterThan(40);
    expect(problems.some((p) => /nobody has said who can answer it/.test(p))).toBe(true);
  });

  it("refuses an unknown control, a kind that is not one, and a shrug for a reason", () => {
    const good = provisionOf("T3-IAM-02")!;
    expect(provisionProblems([{ ...good, objective: "T3-NOPE-01" }])[0]).toMatch(
      /not a control this instrument knows/,
    );
    expect(
      provisionProblems([{ ...good, provision: "central" as unknown as ControlProvision["provision"] }])[0],
    ).toMatch(/is not one of common, hybrid, system-specific/);
    expect(provisionProblems([{ ...good, because: "it is" }])[0]).toMatch(/needs a sentence saying why/);
    expect(PROVISIONS).toHaveLength(3);
  });

  it("says which controls a platform could ever provide", () => {
    expect(isProvidable("T3-IAM-02")).toBe(true);
    expect(isProvidable("T3-DP-01")).toBe(true);
    expect(isProvidable("T3-PRIV-02")).toBe(false);
    expect(isProvidable("T3-NOPE-01")).toBe(false);
  });
});

describe("the platforms", () => {
  it("each name an accountable owner and what they are cleared to hold", () => {
    expect(PLATFORMS_VERSION).toMatch(/^platforms@/);
    for (const platform of PLATFORMS) {
      expect(platform.owner.name.length, platform.id).toBeGreaterThan(3);
      expect(platform.owner.title.length, platform.id).toBeGreaterThan(3);
      expect(platform.allowedData.classifications.length, platform.id).toBeGreaterThan(0);
      expect(platform.purpose.length, platform.id).toBeGreaterThan(20);
    }
    expect(platformProblems([...PLATFORMS])).toEqual([]);
  });

  it("refuses a platform claiming to provide a control only the activity could answer", () => {
    // The rule that ties the two files together, and it caught a real
    // mistake in this data on its first run.
    const overreaching = clonePlatform("PL_ENTRA");
    overreaching.provides = [...overreaching.provides, "T3-PRIV-02"];
    expect(platformProblems([overreaching])[0]).toMatch(
      /which is system-specific — no platform can answer that for an activity/,
    );
  });

  it("refuses one with no owner, an unknown vendor, or a classification nobody can choose", () => {
    const orphan = clonePlatform("PL_AWS");
    orphan.owner = { name: "", title: "" };
    expect(platformProblems([orphan])[0]).toMatch(/needs an owner with a name and a role/);

    const unknown = clonePlatform("PL_AWS");
    unknown.vendor = "V_NOPE";
    expect(platformProblems([unknown])[0]).toMatch(/is not a vendor we know/);

    const invented = clonePlatform("PL_AWS");
    invented.allowedData = { ...invented.allowedData, classifications: ["Top Secret"] };
    expect(platformProblems([invented])[0]).toMatch(/is not a data classification anyone can choose/);
  });

  it("refuses an attestation that lapses before it was made", () => {
    const backwards = clonePlatform("PL_AWS");
    backwards.attestation = { ...backwards.attestation, expires: "2020-01-01" };
    expect(platformProblems([backwards])[0]).toMatch(/never in force/);
  });
});

describe("what a platform discharges", () => {
  it("hands back the controls it provides, with who attested and when", () => {
    const provided = providedBy(["PL_ENTRA"], now);
    expect(provided.length).toBe(6);
    const mfa = provided.find((p) => p.objective === "T3-IAM-02")!;
    expect(mfa.name).toBe("Multi-Factor Authentication");
    expect(mfa.platformName).toBe("Microsoft Entra ID");
    expect(mfa.owner.length).toBeGreaterThan(3);
    expect(mfa.stale).toBe(false);
  });

  it("does not say the same control twice when two platforms provide it", () => {
    const both = providedBy(["PL_ENTRA", "PL_OKTA"], now);
    const ids = both.map((p) => p.objective);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks what came from an attestation that has lapsed", () => {
    // Okta's attestation expired in August. What it provides is still
    // listed, and it is listed as no longer standing — inheritance that
    // outlives its evidence is how a control failure gets laundered.
    const lapsed = providedBy(["PL_OKTA"], now);
    expect(lapsed.length).toBeGreaterThan(0);
    expect(lapsed.every((p) => p.stale)).toBe(true);
    expect(stale(platformById("PL_OKTA")!, now).because).toMatch(/lapsed on .* no longer counts/);
  });

  it("ignores a platform nobody has assessed", () => {
    expect(providedBy(["PL_NOPE"], now)).toEqual([]);
    expect(platformById("PL_NOPE")).toBeNull();
  });
});

describe("what a platform is cleared to hold", () => {
  it("names the mismatch when an activity wants to put more there than it may", () => {
    const wrong = dataMismatches(["PL_GH_COPILOT"], {
      classification: "Restricted",
      elements: ["Customer personal information"],
    });
    expect(wrong).toHaveLength(2);
    expect(wrong[0]!.because).toMatch(/cleared for Public, Internal, and this activity involves Restricted/);
    expect(wrong[1]!.because).toMatch(/not cleared to hold customer personal information/);
  });

  it("is silent when the activity fits", () => {
    expect(
      dataMismatches(["PL_SNOWFLAKE"], {
        classification: "Confidential",
        elements: ["Customer personal information"],
      }),
    ).toEqual([]);
    // "None / Unknown" is not a data type to be cleared for.
    expect(
      dataMismatches(["PL_GH_COPILOT"], { classification: "Internal", elements: ["None / Unknown"] }),
    ).toEqual([]);
  });

  it("offers a roster that says how fresh each platform is", () => {
    const roster = platformRoster(now);
    expect(roster).toHaveLength(PLATFORMS.length);
    const lapsed = roster.filter((p) => p.stale).map((p) => p.name);
    // Four are deliberately out of date in the seed, so the lapse path is
    // exercised by something rather than only by a test fixture.
    expect(lapsed.length).toBeGreaterThan(0);
    for (const entry of roster) expect(entry.because.length).toBeGreaterThan(20);
  });
});
