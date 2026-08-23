/**
 * The UAT record is an artifact, not a conversation (SPEC §10, G-24).
 *
 * These criteria are adapted from the artifact-reviewer pattern: coverage,
 * no orphans, substantive evidence, no blank results, follow-up on failure,
 * and a spec version so a reader knows what it was run against. Here they
 * are tests rather than a reviewer, because this project puts teeth in
 * tests: an unverified claim should fail the build, not wait for someone
 * to notice.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// One parser for "which slices are done", shared with the Stop gate. There
// used to be two, each with a different hole: this one could not match a
// dotted id at all, so the real S2.5 line was already invisible to it
// (enforcement-layer verification, gate 2).
import { doneSlices } from "../../scripts/lib/slices.mjs";

const ROOT = join(__dirname, "..", "..");
const spec = readFileSync(join(ROOT, "SPEC.md"), "utf8");
const specVersion = spec.match(/^spec-version:\s*(.+)$/m)![1]!.trim();
const uatDir = join(ROOT, "uat");
const records = existsSync(uatDir) ? readdirSync(uatDir).filter((f) => f.endsWith(".md")) : [];

/** Requirement IDs a slice owns, from its §17 row. */
function ownedBy(slice: string): string[] {
  const row = spec.match(new RegExp(`^\\| \\*\\*${slice}\\*\\* \\|(.+)$`, "m"));
  if (!row) return [];
  return (row[1].split(" | ")[2] ?? "")
    .split(/[·,]/)
    .map((s) => s.trim())
    .filter((s) => /^(FR|NFR)-\d+$/.test(s));
}

const ALL_IDS = new Set(
  [...spec.matchAll(/^\| ((?:FR|NFR)-\d+) \|/gm)].map((m) => m[1]!),
);

const NON_SUBSTANTIVE = /^(looks good|works|tested|ok|passed|verified|done|n\/a|yes)\.?$/i;

describe("UAT records exist and are complete", () => {
  it("every finished slice has a UAT record", () => {
    // A slice is finished when CLAUDE.md says DONE.
    const status = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
    const finished = [...status.matchAll(/^- (S\d+) [^—]*— DONE/gm)].map((m) => m[1]!);
    expect(finished.length).toBeGreaterThan(0);
    for (const slice of finished) {
      expect(records, `${slice} has no uat/${slice}.md`).toContain(`${slice}.md`);
    }
  });

  for (const file of records) {
    const slice = file.replace(".md", "");
    const body = readFileSync(join(uatDir, file), "utf8");
    // Split rather than lazy-match: `$` under the /m flag matches every line
    // end, which silently produced empty blocks and made this suite pass
    // vacuously. Splitting cannot lie about where a row ends.
    const rows = body
      .split(/^### /m)
      .slice(1)
      .map((chunk) => {
        const id = chunk.match(/^((?:FR|NFR)-\d+)/)?.[1];
        return id ? ([id, chunk] as [string, string]) : null;
      })
      .filter((r): r is [string, string] => r !== null);
    const field = (block: string, name: string) =>
      (block.match(new RegExp(`\\*\\*${name}:\\*\\*(.*)`))?.[1] ?? "").trim();

    describe(`uat/${file}`, () => {
      it("declares the spec version it was run against, honestly", () => {
        // The stamp is what the record RAN against, not what the SPEC says
        // today — rewriting it on a spec bump would falsify the record. What
        // must hold: it exists, it parses, and it is not from the future.
        const version = body.match(/^spec-version:\s*(.+)$/m)?.[1]?.trim();
        expect(version, "missing spec-version").toBeTruthy();
        expect(version, "spec-version must be date.rev").toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
        expect(
          version! <= specVersion,
          `record claims version ${version}, newer than the SPEC's ${specVersion}`,
        ).toBe(true);
      });

      it("says who verified it and when", () => {
        expect(body.match(/^verified-by:\s*(.+)$/m)?.[1]?.trim()).toBeTruthy();
        expect(body.match(/^verified-on:\s*(.+)$/m)?.[1]?.trim()).toBeTruthy();
      });

      it("covers every requirement the slice owns", () => {
        const covered = rows.map((r) => r[0]);
        for (const id of ownedBy(slice)) {
          expect(covered, `${id} has no row`).toContain(id);
        }
      });

      it("has no orphan rows — every row traces to a real requirement", () => {
        for (const row of rows) {
          expect(ALL_IDS, `${row[0]} is not a requirement in §20`).toContain(row[0]);
        }
      });

      it("every row has a pass/fail result — a blank UAT is a template", () => {
        for (const row of rows) {
          const result = field(row[1], "Result").toLowerCase().replace(/[^a-z]/g, "");
          expect(["pass", "fail"], `${row[0]} result is "${result || "blank"}"`).toContain(result);
        }
      });

      it("every row's evidence describes what was observed", () => {
        for (const row of rows) {
          const evidence = field(row[1], "Evidence");
          const observed = field(row[1], "What was observed");
          expect(evidence.length + observed.length, `${row[0]} has no evidence`).toBeGreaterThan(40);
          expect(NON_SUBSTANTIVE.test(evidence), `${row[0]}: "${evidence}" is not evidence`).toBe(
            false,
          );
        }
      });

      it("every failure has a follow-up", () => {
        for (const row of rows) {
          if (field(row[1], "Result").toLowerCase().includes("fail")) {
            expect(row[1], `${row[0]} fails with no follow-up`).toMatch(/follow-?up|issue|remediat/i);
          }
        }
      });

      it("names what it could not verify", () => {
        const section = body.split("## Not verified")[1] ?? "";
        expect(section.replace(/_[^_]*_/g, "").trim().length, "Not verified is empty").toBeGreaterThan(
          20,
        );
      });
    });
  }
});

/**
 * The skeleton and the gate must agree about what a record contains.
 * `pnpm uat:new S6` produced a file the Stop gate immediately rejected,
 * because the required-section list was duplicated as prose in one place
 * and as an array in the other with nothing tying them together
 * (enforcement-layer verification, gate 2).
 */
describe("the record skeleton produces a record the gate accepts", () => {
  const skeleton = readFileSync(join(ROOT, "scripts", "uat-skeleton.mjs"), "utf8");
  const gate = readFileSync(join(ROOT, "scripts", "hooks", "stop-gate.mjs"), "utf8");
  const required = [...gate.matchAll(/heading: "(## [^"]+)"/g)].map((m) => m[1]!);

  it("the gate requires at least the three known sections", () => {
    expect(required).toContain("## Findings");
    expect(required).toContain("## Not verified");
    expect(required).toContain("## Agentic opportunity");
  });

  it("the skeleton emits every section the gate requires", () => {
    for (const heading of required) {
      expect(skeleton, `uat-skeleton.mjs never writes ${heading}`).toContain(heading);
    }
  });
});
