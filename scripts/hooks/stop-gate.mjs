#!/usr/bin/env node
/**
 * Stop gate (SPEC §0 Build Rule 3): work does not conclude on a red build,
 * on a stale generated artifact, or on a slice that skipped its record.
 *
 * Everything here is mechanical. That is the point: three rounds of
 * independent verification found procedures that live only in a skill or a
 * prose line firing only when someone remembered — including registering a
 * slice's agentic opportunity, which fired when the owner asked. A hook
 * cannot forget, so anything that must always hold belongs here or in a
 * test, never only in a skill (G-18).
 *
 * Only tiers that need nothing external run, so the gate is fast and cannot
 * fail for environmental reasons. The full chain is `pnpm verify`.
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doneSlices } from "../lib/slices.mjs";

const ROOT = process.cwd();
const problems = [];

// ---- 1. The build is green ------------------------------------------------
try {
  execSync("pnpm typecheck && pnpm test:unit", { stdio: "pipe", cwd: ROOT });
} catch (error) {
  const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.slice(-1800);
  problems.push("typecheck or unit tests are red — finish the work or fix the break.\n" + output);
}

// ---- 2. Generated artifacts are current -----------------------------------
// A generated file nobody regenerates is a snapshot with better manners.
//
// Regenerate into a temp directory and COMPARE — never write. The old
// version regenerated in place, which meant it repaired what it was
// meant to report and left the working tree dirty by the clock. Both
// outputs are checked: the HTML page was regenerated and never compared,
// so hand-editing the transparency page passed silently
// (enforcement-layer verification, gate 1).
try {
  const scratch = mkdtempSync(join(tmpdir(), "stop-gate-"));
  const html = join(scratch, "agent-map.html");
  const data = join(scratch, "agents.json");
  execSync(`node scripts/build-agent-map.mjs ${html} ${data}`, { stdio: "pipe", cwd: ROOT });
  // The generation date moves every day by design; nothing else may.
  const strip = (t) => t.replace(/"?generated"?:?\s*"?[0-9]{4}-[0-9]{2}-[0-9]{2}"?/g, "");
  const stale = [
    ["src/data/agents.json", data],
    ["docs/agent-map.html", html],
  ].filter(([committed, fresh]) => {
    const on = readFileSync(join(ROOT, committed), "utf8");
    return strip(on) !== strip(readFileSync(fresh, "utf8"));
  });
  if (stale.length > 0) {
    problems.push(
      `${stale.map(([f]) => f).join(" and ")} ${stale.length === 1 ? "is" : "are"} stale. Run \`pnpm agent-map\`, review the diff and commit it.`,
    );
  }
} catch (error) {
  problems.push(`could not verify the agent map: ${error.message}`);
}

// ---- 3. Every finished slice carries its record ----------------------------
// Required sections WITH SUBSTANCE, not just a heading. `body.includes()`
// was satisfied by typing the heading and leaving it empty — and the whole
// reason this check exists is that "register the agentic opportunity"
// stopped happening when it relied on someone remembering. A check a
// person passes by typing four words has not fixed that
// (enforcement-layer verification, gate 2).
const REQUIRED = [
  { heading: "## Findings", what: "a Findings section", least: 80 },
  { heading: "## Not verified", what: "a Not verified section", least: 80 },
  {
    heading: "## Agentic opportunity",
    what: "an Agentic opportunity section (§21 item 6) — what was registered, or an explicit \"none, and why\"",
    least: 120,
  },
  {
    // SPEC calls the slice-verifier non-optional; until 2026-08-23 nothing
    // mechanical checked it ran. The verdict lives in the record, so the
    // record proves the run — a section a person could fake is still a
    // section a person had to consciously fake, which is the honesty line
    // every gate here draws (operating-layer audit, gap 4).
    heading: "## Verifier",
    what: "a Verifier section: the slice-verifier agent's verdict (PASS/FAIL) and what it checked",
    least: 80,
  },
];

/** What a section actually says: its body, minus placeholder italics. */
function sectionBody(document, heading) {
  const at = document.indexOf(heading);
  if (at === -1) return null;
  const rest = document.slice(at + heading.length);
  const end = rest.search(/\n## /);
  return (end === -1 ? rest : rest.slice(0, end))
    .replace(/_[^_]*_/g, "") // the skeleton's italic prompts are not content
    .replace(/\s+/g, " ")
    .trim();
}

try {
  const claude = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
  for (const slice of doneSlices(claude)) {
    const record = join(ROOT, "uat", `${slice}.md`);
    if (!existsSync(record)) {
      problems.push(`slice ${slice} is marked DONE but has no uat/${slice}.md (G-24).`);
      continue;
    }
    const body = readFileSync(record, "utf8");
    // The Verifier section is required of records verified from 2026-08-23
    // (G-55). The five earlier records predate the rule, and writing
    // verdicts into them now would fabricate history — the one thing a
    // UAT record must never do.
    const when = body.match(/^verified-on:\s*(\S+)/m)?.[1] ?? "9999";
    const applicable = REQUIRED.filter(
      (r) => r.heading !== "## Verifier" || when >= "2026-08-23",
    );
    for (const { heading, what, least } of applicable) {
      const said = sectionBody(body, heading);
      if (said === null) problems.push(`uat/${slice}.md is missing ${what}.`);
      else if (said.length < least)
        problems.push(
          `uat/${slice}.md has ${heading} but says almost nothing under it (${said.length} characters). It needs ${what}.`,
        );
    }
  }
} catch (error) {
  problems.push(`could not check slice records: ${error.message}`);
}

// ---- 4. No governance decision has disappeared ----------------------------
// The PreToolUse guard can only inspect an Edit's replacement text, so a
// SPEC rewritten through Bash slipped past it. This compares the whole log
// against the last commit and cannot be walked around by choosing a
// different tool — a decision may be compressed or marked superseded, never
// removed (Build Rule 10).
try {
  const now = readFileSync(join(ROOT, "SPEC.md"), "utf8");
  const committed = execSync("git show HEAD:SPEC.md", { cwd: ROOT, encoding: "utf8" });
  const idsIn = (text) => new Set([...text.matchAll(/\*\*(G-\d+a?) \(/g)].map((m) => m[1]));
  const before = idsIn(committed);
  const after = idsIn(now);
  const gone = [...before].filter((id) => !after.has(id));
  if (gone.length > 0) {
    problems.push(
      `SPEC §13 has lost ${gone.join(", ")} since the last commit. A settled decision is compressed or marked superseded, never removed (Build Rule 10). Restore the id, or mark it superseded and keep it.`,
    );
  }
} catch (error) {
  // No commit yet, or git unavailable: say so rather than passing quietly.
  if (!/unknown revision|does not exist/i.test(String(error.message))) {
    problems.push(`could not check the governance log against the last commit: ${error.message}`);
  }
}

if (problems.length > 0) {
  console.error("Stop gate:\n- " + problems.join("\n- "));
  process.exit(2);
}
process.exit(0);
