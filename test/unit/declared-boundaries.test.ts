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
import {
  asksNothingFurther,
  gateStateLabel,
  STOPS_HERE,
  STOPS_HERE_SHORT,
} from "@/lib/severity";
import type { GateState } from "@/lib/instrument";

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

describe("how a risk area reads in the rail (verifier F11)", () => {
  const at = (key: string, over: Partial<GateState> = {}): GateState => ({
    category: CATEGORIES.find((c) => c.key === key)!,
    answer: "Yes",
    fromIntake: false,
    origin: null,
    because: null,
    settled: false,
    ...over,
  });

  it("a quiet area answered directly declares the boundary", () => {
    expect(gateStateLabel(at("ethics-conduct"))).toBe(STOPS_HERE_SHORT);
  });

  it("a deep area answered directly does not", () => {
    expect(gateStateLabel(at("third-party"))).toBe("Applies");
  });

  it("a quiet area PRE-FILLED still declares it — the branch that was missing", () => {
    // "Yes · from intake" said where the answer came from and nothing about
    // where the product stops, on a surface FR-35 names explicitly. Both
    // facts are true and both are now said.
    const label = gateStateLabel(at("solution-architecture", { fromIntake: true, origin: "intake" }));
    expect(label).toContain("from intake");
    expect(label).toContain("recorded for review");
  });

  it("a deep area pre-filled says only where it came from", () => {
    expect(gateStateLabel(at("third-party", { fromIntake: true, origin: "intake" }))).toBe(
      "Yes · from intake",
    );
    expect(gateStateLabel(at("third-party", { fromIntake: true, origin: "answers" }))).toBe(
      "Yes · from your answers",
    );
  });

  it("an area that applies to everyone keeps its own wording (G-36)", () => {
    // And only that wording — stacking the boundary note on top said the
    // same thing twice (verifier F12).
    expect(gateStateLabel(at("governance", { settled: true }))).toBe("Applies · not asked");
  });

  it("closed and unanswered read as they always did", () => {
    expect(gateStateLabel(at("operational", { answer: "No" }))).toBe("Not applicable");
    expect(gateStateLabel(at("operational", { answer: null }))).toBe("");
  });

  it("every quiet area declares the boundary however its Yes arrived", () => {
    for (const c of CATEGORIES.filter((c) => asksNothingFurther(c.key))) {
      for (const over of [{}, { fromIntake: true, origin: "intake" as const }]) {
        const label = gateStateLabel(at(c.key, over));
        expect(label, `${c.key} ${JSON.stringify(over)}`).toMatch(/recorded for review/);
      }
    }
  });
});

describe("every surface a person sees says it stops", () => {
  it("the gate screen shows the sentence when the area applies and asks nothing", () => {
    const page = read("src/app/(app)/projects/[id]/assess/[category]/page.tsx");
    expect(page).toContain("asksNothingFurther");
    expect(page).toContain("STOPS_HERE");
    // Conditioned on a Yes: an unanswered area must not claim to stop.
    expect(page).toMatch(/state\.answer === "Yes" && !state\.settled && asksNothingFurther/);
  });

  it("the Yes option does not promise questions that never come", () => {
    // Found by walking the screen: "We'll ask more about this area later"
    // was shown to seven areas that ask nothing. A label is a claim.
    const form = read("src/app/(app)/projects/[id]/assess/gate-form.tsx");
    expect(form).toContain("asksNothingFurther");
    expect(form).toMatch(/record it for a reviewer/);
  });

  it("answering Yes on a quiet area does NOT navigate away from its explanation", () => {
    // The slice whose point is "say where the product stops" was itself
    // silent walking forward: gate-form pushed to the next area on every
    // answer, so the declaration rendered only for someone who came back
    // (verifier F10). A Yes on a quiet area now refreshes in place.
    const form = read("src/app/(app)/projects/[id]/assess/gate-form.tsx");
    expect(form).toMatch(/staysToExplain\s*=\s*value === "Yes" && asksNothingFurther/);
    expect(form).toMatch(/if \(staysToExplain\) router\.refresh\(\);/);
    expect(form).toMatch(/else router\.push\(nextHref\)/);
  });

  it("the rail asks one rule rather than nesting its own", () => {
    // The five-level ternary this replaces is where F11 hid: the boundary
    // note was added to one branch and the pre-filled branch was forgotten.
    const rail = read("src/app/(app)/projects/[id]/assess/gate-rail.tsx");
    expect(rail).toContain("gateStateLabel(state)");
    expect(rail, "the rail must not re-derive the label").not.toMatch(/asksNothingFurther/);
  });

  it("a settled area does not get the boundary block stacked on its own note (F12)", () => {
    const page = read("src/app/(app)/projects/[id]/assess/[category]/page.tsx");
    expect(page).toMatch(/!state\.settled && asksNothingFurther\(key\)/);
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
