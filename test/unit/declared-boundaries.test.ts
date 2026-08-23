/**
 * FR-35 / G-50 — where the pilot stops, it says so.
 *
 * Tier-2 depth is four risk areas of eleven. That scope is deliberate; the
 * defect was the silence. An area that applies and asks nothing looked
 * exactly like one that applies and opens twelve questions, so a person
 * could not tell "nothing more to ask" from "not built yet" — and silence
 * reads as completeness.
 *
 * These tests fail if a dead end ever goes unlabelled again, including one
 * created later by removing the last path from a deep area.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@/lib/instrument";
import { asksNothingFurther, STOPS_HERE, STOPS_HERE_SHORT } from "@/lib/severity";

const ROOT = join(__dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const quiet = CATEGORIES.filter((c) => asksNothingFurther(c.key));
const deep = CATEGORIES.filter((c) => !asksNothingFurther(c.key));

describe("which areas ask nothing further is derived, not listed", () => {
  it("is the four deep areas the governance log names, and seven quiet ones", () => {
    expect(deep.map((c) => c.key).sort()).toEqual(
      ["ai", "data-privacy", "security-resilience", "third-party"].sort(),
    );
    expect(quiet).toHaveLength(7);
  });

  it("an area with paths but no severity questions still counts as quiet", () => {
    // The trap: adding a path option without a severity question behind it
    // would make an area look deep while asking nothing. The predicate
    // reads the severity set, not merely the presence of paths.
    const withPathsButNoQuestions = CATEGORIES.filter(
      (c) => (c.pathQuestion?.options.length ?? 0) > 0 && asksNothingFurther(c.key),
    );
    for (const c of withPathsButNoQuestions) {
      expect(asksNothingFurther(c.key), `${c.key} has paths but asks nothing`).toBe(true);
    }
  });
});

describe("every surface a person sees says it stops", () => {
  it("the gate screen shows the sentence when the area applies and asks nothing", () => {
    const page = read("src/app/(app)/projects/[id]/assess/[category]/page.tsx");
    expect(page).toContain("asksNothingFurther");
    expect(page).toContain("STOPS_HERE");
    // Conditioned on a Yes: an unanswered area must not claim to stop.
    expect(page).toMatch(/state\.answer === "Yes" && asksNothingFurther/);
  });

  it("the Yes option does not promise questions that never come", () => {
    // Found by walking the screen: "We'll ask more about this area later"
    // was shown to seven areas that ask nothing. A label is a claim.
    const form = read("src/app/(app)/projects/[id]/assess/gate-form.tsx");
    expect(form).toContain("asksNothingFurther");
    expect(form).toMatch(/record it for a reviewer/);
  });

  it("the rail distinguishes the two kinds of Applies", () => {
    const rail = read("src/app/(app)/projects/[id]/assess/gate-rail.tsx");
    expect(rail).toContain("STOPS_HERE_SHORT");
    expect(rail).toContain("asksNothingFurther");
  });

  it("the summary counts work separately from what is only recorded", () => {
    const summary = read("src/app/(app)/projects/[id]/assess/complete/page.tsx");
    expect(summary).toMatch(/const deep = applies\.filter/);
    expect(summary).toMatch(/const quiet = applies\.filter/);
    expect(summary).toContain("open detailed questions");
    expect(summary).toContain("recorded for a reviewer");
  });
});

describe("the wording holds the line the governance entry drew", () => {
  it("names the four deep areas rather than saying 'not built'", () => {
    // A person is owed the boundary, not our backlog. "Coming soon" would
    // promise a date nobody has agreed (§24.8).
    expect(STOPS_HERE).toMatch(/third party/i);
    expect(STOPS_HERE).not.toMatch(/coming soon|not built|unavailable|todo/i);
  });

  it("is plain language with no internal identifiers (NFR-9)", () => {
    for (const text of [STOPS_HERE, STOPS_HERE_SHORT]) {
      expect(text).not.toMatch(/\b(FR|NFR|G)-\d+\b/);
      expect(text).not.toMatch(/\b(gate|path|sev)\.[a-z_]+/);
      expect(text).not.toMatch(/Tier ?[123]/);
    }
  });

  it("the short form still says the area applies — never only that it stopped", () => {
    expect(STOPS_HERE_SHORT).toMatch(/applies/i);
  });
});
