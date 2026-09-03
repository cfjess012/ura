/**
 * FR-52 / NFR-24 · a framework is grounded, licensed correctly and dated.
 *
 * The rules these hold are the ones that cannot be left to care: a quote on
 * a licensed framework is a legal problem, a clause number nobody
 * transcribed is a fabrication, and a framework nobody re-checked is wrong
 * without saying so.
 */
import { describe, expect, it } from "vitest";
import {
  FRAMEWORKS,
  frameworkById,
  frameworkProblems,
  frameworkStanding,
  itemOf,
  quoteIn,
  quoteOf,
  stale,
  type Framework,
} from "@/lib/frameworks";

const clone = (): Framework => JSON.parse(JSON.stringify(FRAMEWORKS[0])) as Framework;

describe("what ships", () => {
  it("is public, transcribed from its publisher, and says so", () => {
    expect(FRAMEWORKS.length).toBeGreaterThan(0);
    for (const f of FRAMEWORKS) {
      expect(f.quotable, `${f.id} ships, so it must be quotable`).toBe(true);
      expect(f.source.url).toMatch(/^https:\/\//);
      expect(f.licence.length).toBeGreaterThan(20);
      expect(frameworkProblems(f)).toEqual([]);
    }
  });

  it("carries the cybersecurity framework's own core, at its published size", () => {
    // 106 current subcategories is what NIST publishes for 2.0. A
    // transcription that drifts from that count has lost or invented rows.
    const csf = frameworkById("nist-csf-2.0");
    expect(csf).not.toBeNull();
    expect(csf!.items.filter((i) => !i.withdrawn)).toHaveLength(106);
    expect(itemOf("nist-csf-2.0", "GV.OC-01")?.text).toBe(
      "The organizational mission is understood and informs cybersecurity risk management",
    );
    // Withdrawn items stay, so a mapping made against one can be told.
    expect(itemOf("nist-csf-2.0", "ID.AM-06")?.withdrawn).toBe(true);
  });

  it("carries each regulation at its published article count", () => {
    // 99 articles in the GDPR, 113 in the AI Act. A transcription that
    // drifts from those numbers has dropped or invented law.
    expect(frameworkById("gdpr-2016-679")!.items).toHaveLength(99);
    expect(frameworkById("eu-ai-act-2024-1689")!.items).toHaveLength(113);
    expect(itemOf("gdpr-2016-679", "Article 32")?.heading).toBe("Security of processing");
    expect(itemOf("eu-ai-act-2024-1689", "Article 9")?.heading).toBe("Risk management system");
    expect(quoteOf("gdpr-2016-679", "Article 35")).toContain("data protection impact assessment");
  });

  it("knows nothing it was not given", () => {
    expect(frameworkById("iso-27001")).toBeNull();
    expect(itemOf("nist-csf-2.0", "GV.XX-99")).toBeNull();
    expect(quoteOf("nist-csf-2.0", "GV.XX-99")).toBeNull();
  });
});

describe("the licensing rule", () => {
  it("refuses text on a framework whose text may not be reproduced", () => {
    const licensed = clone();
    licensed.quotable = false;
    // Reference and heading are fine; the words are not.
    const problems = frameworkProblems(licensed);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatch(/carries text, but .* is licensed — reference and heading only/);
    licensed.items = licensed.items.map(({ ref, heading }) => ({ ref, heading }));
    expect(frameworkProblems(licensed)).toEqual([]);
  });

  it("never hands back a quote from a licensed framework, even one carrying text", () => {
    // The belt to the validator's brace: an organisation loading its own
    // ISO copy (FR-54) never passes through the shipped registry, so the
    // rule has to hold on any candidate, not only on what we ship.
    const licensed = clone();
    licensed.quotable = false;
    expect(quoteIn(licensed, "GV.OC-01")).toBeNull();
    expect(quoteIn(clone(), "GV.OC-01")).toBe(
      "The organizational mission is understood and informs cybersecurity risk management",
    );
    expect(quoteOf("nist-csf-2.0", "GV.OC-01")).toBe(
      "The organizational mission is understood and informs cybersecurity risk management",
    );
  });

  it("refuses a quotable framework whose wording is missing, since nothing could check a mapping to it", () => {
    const hollow = clone();
    hollow.items[0] = { ref: hollow.items[0]!.ref, heading: hollow.items[0]!.heading };
    expect(frameworkProblems(hollow)[0]).toMatch(/has no text, and this framework is quotable/);
  });
});

describe("provenance and currency", () => {
  it("refuses a file that cannot say where it came from or who checked it", () => {
    const noSource = clone();
    noSource.source = { ...noSource.source, url: "" };
    expect(frameworkProblems(noSource)[0]).toMatch(/needs the source URL/);

    const noRetrieval = clone();
    noRetrieval.source = { ...noRetrieval.source, retrieved: "last week" };
    expect(frameworkProblems(noRetrieval)[0]).toMatch(/needs the date its source was retrieved/);

    const anonymous = clone();
    anonymous.checkedBy = "  ";
    expect(frameworkProblems(anonymous)[0]).toMatch(/has no who checked it/);

    const undated = clone();
    undated.checkedOn = "2026";
    expect(frameworkProblems(undated)[0]).toMatch(/checkedOn must be a date/);
  });

  it("refuses a review window that is not a sane number of months", () => {
    for (const window of [0, -1, 37, 1.5, "12" as unknown as number]) {
      const odd = clone();
      odd.reviewWindowMonths = window;
      expect(frameworkProblems(odd)[0], String(window)).toMatch(/review window must be/);
    }
  });

  it("refuses two items with the same reference", () => {
    const doubled = clone();
    doubled.items = [doubled.items[0]!, doubled.items[0]!];
    expect(frameworkProblems(doubled)[0]).toMatch(/appears twice/);
  });

  it("goes stale on its own clock, and says what to do about it", () => {
    const f = { id: "x", name: "A Framework", edition: "2.0", checkedOn: "2026-01-15", reviewWindowMonths: 12 };
    expect(stale(f, new Date("2027-01-14T00:00:00Z")).stale).toBe(false);
    const late = stale(f, new Date("2027-01-16T00:00:00Z"));
    expect(late.stale).toBe(true);
    expect(late.because).toContain("2026-01-15");
    expect(late.because).toContain("2027-01-15");
  });

  it("nothing shipped is stale today — re-transcribe it when this fails", () => {
    // NFR-24's teeth. When this goes red the fix is not to move the date:
    // run `node scripts/fetch-framework.mjs <id>`, confirm the publisher
    // still calls it that edition, and commit what comes back.
    const overdue = frameworkStanding(new Date()).filter((f) => f.stale);
    expect(overdue.map((f) => f.because)).toEqual([]);
  });
});
