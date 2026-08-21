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
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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
try {
  const before = readFileSync(join(ROOT, "src", "data", "agents.json"), "utf8");
  execSync("node scripts/build-agent-map.mjs", { stdio: "pipe", cwd: ROOT });
  const after = readFileSync(join(ROOT, "src", "data", "agents.json"), "utf8");
  const strip = (t) => t.replace(/"generated":\s*"[^"]*"/, "");
  if (strip(before) !== strip(after)) {
    problems.push(
      "the agent map was stale and has been regenerated — review the diff and commit it (`git diff src/data/agents.json docs/agent-map.html`).",
    );
  }
} catch (error) {
  problems.push(`could not verify the agent map: ${error.message}`);
}

// ---- 3. Every finished slice carries its record ----------------------------
// Required sections, not just a file: a record missing its agentic section
// is how "register the agentic opportunity" quietly stopped happening.
const REQUIRED = [
  { heading: "## Findings", what: "a Findings section" },
  { heading: "## Not verified", what: "a Not verified section" },
  { heading: "## Agentic opportunity", what: "an Agentic opportunity section (§21 item 6)" },
];
try {
  const claude = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
  // Global, not per line: CLAUDE.md packs two slices onto one line to stay
  // inside its size budget, and a line-anchored match found only the first.
  const done = [...claude.matchAll(/\b(S[\d.]+)[^—\n]{0,40}— DONE/g)].map((m) => m[1]);
  for (const slice of done) {
    const record = join(ROOT, "uat", `${slice}.md`);
    if (!existsSync(record)) {
      problems.push(`slice ${slice} is marked DONE but has no uat/${slice}.md (G-24).`);
      continue;
    }
    const body = readFileSync(record, "utf8");
    for (const { heading, what } of REQUIRED) {
      if (!body.includes(heading)) problems.push(`uat/${slice}.md is missing ${what}.`);
    }
  }
} catch (error) {
  problems.push(`could not check slice records: ${error.message}`);
}

// ---- 4. The demo conversation has been had ------------------------------
// Build completeness is not demo readiness. This does not judge whether the
// demo is good — it refuses to let a slice finish without someone saying
// what it changed for the room (G-44).
try {
  const readiness = readFileSync(join(ROOT, "demo", "readiness.md"), "utf8");
  const claude = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
  const done = [...claude.matchAll(/\b(S[\d.]+)[^—\n]{0,40}— DONE/g)].map((m) => m[1]).sort();
  const covered = (readiness.match(/^slices-covered:\s*(.+)$/m)?.[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
  const missing = done.filter((s) => !covered.includes(s));
  if (missing.length > 0) {
    problems.push(
      `demo/readiness.md does not cover ${missing.join(", ")}. Before finishing: which beat does this slice add or change, is it built, has a person walked it, and what is the fallback if it breaks in front of the room? Update the file and say so out loud — this is the conversation, not the paperwork.`,
    );
  }
} catch (error) {
  problems.push(`could not read demo/readiness.md — the demo record is missing: ${error.message}`);
}

if (problems.length > 0) {
  console.error("Stop gate:\n- " + problems.join("\n- "));
  process.exit(2);
}
process.exit(0);
