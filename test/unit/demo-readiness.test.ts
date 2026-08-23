/**
 * Demo readiness is an artifact, not an intention (G-44).
 *
 * Build completeness and demo readiness are different things: a requirement
 * can be fully met and still be unfit to show, and until this file existed
 * nothing tracked the second one. These checks make a beat with a blank
 * cell fail the build, because a beat with a blank cell is a hope.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { doneSlices } from "../../scripts/lib/slices.mjs";

const ROOT = join(__dirname, "..", "..");
const doc = readFileSync(join(ROOT, "demo", "readiness.md"), "utf8");
const claudeMd = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");

const rows = (heading: string) =>
  (doc.split(heading)[1] ?? "")
    .split(/^## /m)[0]!
    .split("\n")
    .filter((l) => l.startsWith("|") && !l.includes("---") && !/^\|\s*#\s*\|/.test(l))
    .filter((l) => !/^\| Risk \|/.test(l))
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));

describe("the demo readiness record is complete", () => {
  it("covers exactly the slices that are finished", () => {
    // The teeth: finish a slice without revisiting what it changed for the
    // demo and this fails, which forces the conversation rather than
    // hoping someone starts it.
    const done = doneSlices(claudeMd);
    const covered = (doc.match(/^slices-covered:\s*(.+)$/m)?.[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    expect([...covered].sort(), "demo/readiness.md is stale — a slice finished and nobody revisited the demo").toEqual(
      [...done].sort(),
    );
  });

  it("every beat says what it is, who delivers it, and what happens if it breaks", () => {
    const beats = rows("## The beats");
    expect(beats.length).toBeGreaterThan(5);
    for (const cells of beats) {
      expect(cells.length, `row has ${cells.length} cells: ${cells[1]}`).toBe(6);
      for (const [i, cell] of cells.entries()) {
        expect(cell.length, `beat "${cells[1]}" has an empty column ${i + 1}`).toBeGreaterThan(0);
        expect(/^(tbd|todo|\?+)$/i.test(cell), `beat "${cells[1]}" column ${i + 1} is a placeholder`).toBe(false);
      }
      // A fallback is the column people skip. It is also the only one that
      // matters when something fails in front of an audience.
      expect(cells[5]!.length, `beat "${cells[1]}" has no fallback`).toBeGreaterThan(15);
    }
  });

  it("says plainly which beats are not built, rather than implying they are", () => {
    const beats = rows("## The beats");
    const unbuilt = beats.filter((c) => /\bno\b/i.test(c[3]!));
    for (const cells of unbuilt) {
      expect(
        /not demoable yet|do not promise|describe it/i.test(cells[5]!),
        `beat "${cells[1]}" is not built but its fallback does not say so`,
      ).toBe(true);
    }
  });

  it("names the risks that are not features, and what to do about each", () => {
    const risks = rows("## Risks that are not features");
    expect(risks.length).toBeGreaterThan(2);
    for (const cells of risks) {
      expect(cells.length).toBe(3);
      expect(cells[2]!.length, `risk "${cells[0]}" has no mitigation`).toBeGreaterThan(15);
    }
  });

  it("keeps a list of what will not be claimed", () => {
    const section = doc.split("## What we will not claim")[1] ?? "";
    expect(section.split("\n").filter((l) => l.startsWith("- ")).length).toBeGreaterThan(1);
  });
});

describe("the three-minute run sheet quotes the product, not a memory of it", () => {
  /**
   * The sheet told a presenter to click "Answer them →" — a control renamed
   * an hour before the sheet was written, in a commit whose own record
   * mentions the rename. A run sheet is read aloud in front of leadership;
   * a stale quote in it is the worst defect it can carry (verifier D1).
   */
  const sheet = readFileSync(join(ROOT, "demo", "three-minutes.md"), "utf8");
  const source = (file: string) => readFileSync(join(ROOT, file), "utf8");

  it("every control it names by label exists in the app", () => {
    const labels = [...sheet.matchAll(/\*\*((?:Answer|Hand|Save)[^*]{3,60}?)(?:\s*(?:→|&rarr;))?\*\*/g)].map(
      (m) => m[1]!.replace(/\s*(→|&rarr;)\s*$/, "").trim(),
    );
    expect(labels.length, "no labelled controls found in the sheet").toBeGreaterThan(2);
    const app = ["src/app/(app)/projects/[id]/assess/complete/page.tsx",
                 "src/app/(app)/projects/[id]/assess/severity/handoff-panel.tsx"]
      .map(source)
      .join("\n");
    for (const label of labels) {
      expect(app, `the sheet says click "${label}" — no such control`).toContain(label);
    }
  });

  // Deliberately NOT here: a check that the sheet's quoted SENTENCES appear
  // in the product. They are built from template literals with counts
  // interpolated into them, so matching source text means matching around
  // holes — a test that is fragile in both directions and would be trusted
  // more than it deserves. `pnpm walk:demo` renders the real pages and
  // checks the sentences a presenter reads aloud; that is the guard.

  it("tells the presenter how to restore the demo data", () => {
    // Answers are insert-only, so a walk-through cannot be undone. Without
    // this the sheet's own Beat 3 breaks on second use and there is no way
    // back (verifier D2, D3).
    expect(sheet).toMatch(/pnpm demo:reset/);
    const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;
    expect(scripts["demo:reset"], "demo:reset is referenced but not defined").toBeTruthy();
    expect(scripts["demo:reset"]).toContain("seed-demo");
  });
});
