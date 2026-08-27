/**
 * The description fixtures stay on the side of the floor they were written
 * for (FR-43).
 *
 * `test/fixtures/descriptions/` is a gradient: two files that must fall
 * below the heuristic floor, and eight that must pass it and reach the
 * model. The gradient is the whole point of the set — a fixture that
 * silently drifts across the line stops testing what its name says, and
 * nothing else would notice, because the floor is the one layer that runs
 * with no agent at all.
 *
 * Only the floor is asserted here. The band a scored file lands in is a
 * model's judgement and belongs in `pnpm ai:check`, not in a unit suite
 * that must pass with no model connected.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { belowFloor } from "@/lib/intake-rubric";

const DIR = join(__dirname, "..", "fixtures", "descriptions");
const read = (name: string) => readFileSync(join(DIR, name), "utf8");
const files = readdirSync(DIR)
  .filter((n) => n.endsWith(".txt"))
  .sort();

/** The two written to be caught before a model is ever called. */
const BELOW = ["01-floor-product-name.txt", "02-floor-not-prose.txt"];

describe("the description fixture gradient", () => {
  it("has every file accounted for as either below the floor or above it", () => {
    expect(files.length).toBe(10);
    for (const name of BELOW) expect(files).toContain(name);
  });

  it.each(BELOW)("%s is caught by the floor, with no model", (name) => {
    expect(belowFloor(read(name))).not.toBeNull();
  });

  it.each(files.filter((n) => !BELOW.includes(n)))(
    "%s passes the floor and reaches scoring",
    (name) => {
      expect(belowFloor(read(name))).toBeNull();
    },
  );

  it("catches a product name for being too short, not for being noise", () => {
    // The two floor files must fail for DIFFERENT reasons, or one of the
    // three heuristics is untested by this set.
    const short = belowFloor(read("01-floor-product-name.txt"));
    const noise = belowFloor(read("02-floor-not-prose.txt"));
    expect(short).not.toBe(noise);
  });
});
