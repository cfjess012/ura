/**
 * "Synced by construction" (§20) is only true if something constructs it.
 *
 * Two drifts this file exists to catch, both of which happened:
 * - The readiness doc told the presenter to say a number the instrument no
 *   longer produced (fixed by prefill-reach.test.ts, same idea).
 * - The hand-off feature shipped citing FR-36 and S4.7 while neither existed
 *   in SPEC.md (G-54). Code may only cite requirement IDs the SPEC defines.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const spec = readFileSync(join(ROOT, "SPEC.md"), "utf8");

/** §20's tables: every `| FR-n |` / `| NFR-n |` row and its Slice column. */
function registerRows(): Map<string, string> {
  const rows = new Map<string, string>();
  for (const m of spec.matchAll(/^\| ((?:FR|NFR)-\d+) \|.*\| ([^|]+) \|$/gm)) {
    rows.set(m[1], m[2].trim());
  }
  return rows;
}

/** §17's table: slice id → the Owns cell. */
function sliceOwns(): Map<string, string> {
  const owns = new Map<string, string>();
  for (const m of spec.matchAll(/^\| \*\*(S[\d.]+)\*\* \|(?:[^|]*\|){3}([^|]*)\|/gm)) {
    owns.set(m[1], m[2]);
  }
  return owns;
}

describe("the register and the slices agree (§20)", () => {
  const rows = registerRows();
  const owns = sliceOwns();

  it("parses both tables", () => {
    expect(rows.size).toBeGreaterThanOrEqual(55);
    expect(owns.size).toBeGreaterThanOrEqual(16);
  });

  it("every requirement's owning slice exists in §17, or is a standing rule", () => {
    for (const [id, slice] of rows) {
      const named = slice.match(/S[\d.]+/g);
      if (!named) {
        // A standing rule ("Every slice", review-enforced) or a phase pointer.
        expect(
          /every slice|onward|review|phase|epic/i.test(slice),
          `${id} names no slice and is not a standing rule: "${slice}"`,
        ).toBe(true);
        continue;
      }
      for (const s of named) {
        expect(owns.has(s), `${id} is owned by ${s}, which is not in §17`).toBe(true);
      }
    }
  });

  it("every ID in a §17 Owns cell exists in the register", () => {
    for (const [slice, cell] of owns) {
      for (const id of cell.match(/(?:FR|NFR)-\d+/g) ?? []) {
        expect(rows.has(id), `${slice} owns ${id}, which is not in §20`).toBe(true);
      }
    }
  });

  it("every slice-owned requirement names that slice back", () => {
    for (const [slice, cell] of owns) {
      for (const id of cell.match(/(?:FR|NFR)-\d+/g) ?? []) {
        const home = rows.get(id) ?? "";
        expect(
          home.includes(slice) || /every slice|onward/i.test(home),
          `${slice} owns ${id}, but ${id}'s row says "${home}"`,
        ).toBe(true);
      }
    }
  });
});

describe("code cites only requirement IDs the SPEC defines (G-54)", () => {
  const rows = registerRows();
  const files: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) files.push(full);
    }
  })(join(ROOT, "src"));

  it("every FR/NFR mentioned under src/ exists in §20", () => {
    for (const file of files) {
      for (const id of readFileSync(file, "utf8").match(/(?:FR|NFR)-\d+/g) ?? []) {
        expect(rows.has(id), `${file.slice(ROOT.length + 1)} cites ${id}, which §20 does not define`).toBe(true);
      }
    }
  });
});
