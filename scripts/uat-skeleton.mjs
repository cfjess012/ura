#!/usr/bin/env node
/**
 * Generates the UAT record skeleton for a slice — one row per requirement
 * the slice owns, read straight out of SPEC.md §17 and §20.
 *
 * Why a committed file rather than a chat message: this platform's whole
 * thesis is attested, auditable evidence. Our own testing evidence should
 * meet the same bar — a record that survives the conversation, says which
 * spec version it was run against, and can be read by someone who wasn't
 * there.
 *
 * Usage: node scripts/uat-skeleton.mjs S3
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const slice = (process.argv[2] ?? "").toUpperCase();
if (!/^S\d+(\.\d+)?$/.test(slice)) {
  console.error("Usage: node scripts/uat-skeleton.mjs S3");
  process.exit(1);
}

const spec = readFileSync(join(process.cwd(), "SPEC.md"), "utf8");
const version = spec.match(/^spec-version:\s*(.+)$/m)?.[1]?.trim() ?? "unversioned";

const row = spec.match(new RegExp(`^\\| \\*\\*${slice}\\*\\* \\|.+$`, "m"));
if (!row) {
  console.error(`No row for ${slice} in SPEC §17.`);
  process.exit(1);
}
// Columns are found by their header, not counted. §17 gained a Status column
// on 2026-08-23 and this shifted silently, producing a skeleton whose
// requirement row was the Builds prose — a generator that reads position
// breaks the moment the table it reads is edited.
const header = spec.match(/^\| # \| Slice \|.*$/m);
if (!header) throw new Error("§17's table header not found — has the delivery plan changed shape?");
const columns = header[0].split("|").map((c) => c.trim());
const columnAt = (name) => {
  const at = columns.findIndex((c) => c.toLowerCase() === name.toLowerCase());
  if (at === -1) throw new Error(`§17 has no "${name}" column; found: ${columns.filter(Boolean).join(", ")}`);
  return at;
};
// The WHOLE row, so its cells line up with the header's by index.
const cells = row[0].split("|").map((c) => c.trim());
const owns = (cells[columnAt("Owns")] ?? "")
  .split(/[·,]/)
  .map((s) => s.trim())
  .filter(Boolean);
const doneWhen = (cells[columnAt("Done when")] ?? "").trim();

const describe = (id) => {
  const line = spec.match(new RegExp(`^\\| ${id} \\| (.+?) \\|`, "m"));
  return line ? line[1].trim() : "(not found in §20)";
};

const out = join(process.cwd(), "uat", `${slice}.md`);
if (existsSync(out)) {
  console.error(`${out} already exists — edit it rather than regenerating.`);
  process.exit(1);
}

const rows = owns
  .map(
    (id) => `### ${id} — ${describe(id)}

- **What was done:**
- **What was observed:**
- **Result:**
- **Evidence:**
`,
  )
  .join("\n");

writeFileSync(
  out,
  `---
slice: ${slice}
spec-version: ${version}
verified-by:
verified-on:
---

# UAT — ${slice}

**Done when:** ${doneWhen}

Every requirement this slice owns gets a row below. Fill each one with what
was actually done and actually observed — "works" is not evidence. A row
marked \`fail\` needs a follow-up note saying how it will be addressed.

${rows}
## Findings

_Anything observed that was not a requirement — with severity and follow-up._

## Agentic opportunity

_Required by SPEC §21 item 6 and enforced by the Stop gate. What agentic
capability this slice designed and registered — or an explicit "none, and
why". Phase 1 ships no agent; it may not ship anything that forecloses one._

## Verifier

_The slice-verifier agent's verdict (PASS/FAIL) and what it checked — the
record proves the run (Stop gate, 2026-08-23)._

## Not verified

_Always present. Name the gaps in this run's coverage rather than implying
completeness._
`,
);
console.log(`wrote uat/${slice}.md — ${owns.length} requirement rows (${owns.join(", ")})`);
