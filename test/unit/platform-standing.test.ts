/**
 * G-83 · what is leaning on each platform.
 *
 * The plan called this the blast radius and said to build it early: quarterly
 * attestation with nobody able to see what depends on them is a calendar
 * reminder, not a control. These hold the arithmetic behind that screen.
 */
import { describe, expect, it } from "vitest";
import {
  attentionFirst,
  clearance,
  dependentsByPlatform,
  platformStandings,
  providedControls,
  unsupported,
} from "@/lib/platform-standing";
import { PLATFORMS_QUESTION } from "@/lib/inheritance";
import { platformById } from "@/lib/platforms";

const now = new Date("2026-09-04T12:00:00Z");
const runsOn = (...ids: string[]) => ({
  [PLATFORMS_QUESTION]: { value: ids },
});
const draft = (id: string, name: string, ...on: string[]) => ({
  id,
  name,
  submittedAt: null,
  answers: runsOn(...on),
});

describe("what each platform is carrying", () => {
  it("indexes assessments by the platforms their answers name", () => {
    const found = dependentsByPlatform([
      draft("p1", "Partner data exchange", "PL_ENTRA", "PL_SNOWFLAKE"),
      draft("p2", "Pricing assistant", "PL_ENTRA"),
      { id: "p3", name: "Nothing chosen", submittedAt: null, answers: {} },
    ]);
    expect(found.get("PL_ENTRA")!.map((d) => d.name)).toEqual([
      "Partner data exchange",
      "Pricing assistant",
    ]);
    expect(found.get("PL_SNOWFLAKE")).toHaveLength(1);
    expect(found.has("PL_GCP")).toBe(false);
  });

  it("drops an id no platform matches, rather than counting it", () => {
    // A stored choice whose platform no longer exists is a record of
    // something nobody can act on; counting it would inflate the one number
    // this screen exists to be trusted on.
    const found = dependentsByPlatform([draft("p1", "Old", "PL_RETIRED")]);
    expect(found.size).toBe(0);
  });

  it("carries whether each dependant is still being answered", () => {
    const submitted = new Date("2026-08-01T00:00:00Z");
    const found = dependentsByPlatform([
      { id: "p1", name: "Done", submittedAt: submitted, answers: runsOn("PL_ENTRA") },
      draft("p2", "Open", "PL_ENTRA"),
    ]);
    expect(found.get("PL_ENTRA")!.map((d) => d.submittedAt)).toEqual([
      submitted,
      null,
    ]);
  });
});

describe("where each platform stands", () => {
  it("returns every platform, whether anything depends on it or not", () => {
    const standings = platformStandings([draft("p1", "One", "PL_ENTRA")], now);
    expect(standings.length).toBeGreaterThan(10);
    const entra = standings.find((s) => s.id === "PL_ENTRA")!;
    expect(entra.dependents).toHaveLength(1);
    expect(entra.ownerName.length).toBeGreaterThan(3);
    expect(entra.stale).toBe(false);
    expect(entra.because).toBe("");
    // A platform nobody uses is still listed — absence that looks like
    // coverage is the failure this kind of page exists to prevent.
    expect(standings.some((s) => s.dependents.length === 0)).toBe(true);
  });

  it("says why a lapsed one is lapsed, in the same words the requester sees", () => {
    const okta = platformStandings([], now).find((s) => s.id === "PL_OKTA")!;
    expect(okta.stale).toBe(true);
    expect(okta.because).toMatch(/lapsed on .* no longer counts/);
  });

  it("counts what has become unsupported, not merely what expired", () => {
    // Two lapsed platforms, one assessment leaning on both: the number that
    // matters is how many assessments are affected, not how many rows are red.
    const standings = platformStandings(
      [draft("p1", "Both", "PL_OKTA", "PL_DATABRICKS"), draft("p2", "Fine", "PL_ENTRA")],
      now,
    );
    const lapsed = unsupported(standings);
    expect(lapsed.platforms).toBeGreaterThanOrEqual(2);
    expect(lapsed.assessments).toBe(1);
  });

  it("puts what needs attention first, then what carries the most", () => {
    const order = attentionFirst(
      platformStandings([draft("p1", "One", "PL_ENTRA")], now),
    );
    const firstFresh = order.findIndex((s) => !s.stale);
    expect(order.slice(0, firstFresh).every((s) => s.stale)).toBe(true);
    // Among the ones still in force, the most depended-on comes first.
    expect(order[firstFresh]!.id).toBe("PL_ENTRA");
  });
});

describe("one platform's own record", () => {
  it("names its controls, and says none counts once it has lapsed", () => {
    const live = providedControls(platformById("PL_ENTRA")!, now);
    expect(live.length).toBeGreaterThan(0);
    expect(live.every((c) => c.counts)).toBe(true);
    // Named, never coded — no identifier may reach the screen (NFR-9).
    expect(live.every((c) => !/^T[0-9]-/.test(c.name))).toBe(true);

    const lapsed = providedControls(platformById("PL_OKTA")!, now);
    expect(lapsed.length).toBeGreaterThan(0);
    expect(lapsed.every((c) => c.counts)).toBe(false);
  });

  it("states the ceiling it may hold, matching the compatibility warning", () => {
    const lines = clearance(platformById("PL_GH_COPILOT")!);
    expect(lines[0]).toBe("Cleared up to Internal.");
    expect(lines.join(" ")).toMatch(/May hold/);
  });

  it("says plainly when a platform holds no categorised data", () => {
    const lines = clearance({
      ...platformById("PL_ENTRA")!,
      allowedData: { classifications: [], dataElements: [], conditions: [] },
    });
    expect(lines[0]).toBe("Not cleared for any classification of data.");
    expect(lines[1]).toBe("May hold no categorised data.");
  });
});
