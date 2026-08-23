#!/usr/bin/env node
/**
 * PostToolUse advisory (SPEC G-18, "teeth in hooks").
 *
 * Skills load probabilistically. This hook makes the trigger deterministic:
 * when a file is edited that a standard governs, it does not merely *name*
 * the skill — it emits the skill's own checklist, so the procedure arrives
 * in context whether or not anyone chose to load it. Naming a skill still
 * leaves the loading to judgement, and three rounds of verification found
 * judgement is exactly what forgets.
 *
 * It never blocks; it reminds at the exact moment of relevance. What it
 * cannot do is force the checklist to be followed — that is the Stop gate's
 * job, and the artifacts it requires.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writtenPaths } from "../lib/written-paths.mjs";

/**
 * A skill's checklist: its headline rules, not the whole file. Enough to act
 * on without flooding the context of a one-line edit.
 */
function checklist(skill) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const path = join(root, ".claude", "skills", skill, "SKILL.md");
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    // Never silent. A missing skill used to produce a note with the block
    // simply absent, so the standard a session was told to follow could
    // vanish without a word (enforcement-layer verification, gate 4).
    return `\n   ${skill} — MISSING. .claude/skills/${skill}/SKILL.md could not be read, so its checklist is not below. Do not proceed as if the standard does not exist.`;
  }
  // Skills are written as prose under headings, so the headings ARE the
  // checklist. Bold leads are used too; take whichever the file has.
  //
  // The bold pattern is /s-flagged and allows a wrapped run: `**a rule
  // that continues\non the next line**` used to match nothing, which is
  // exactly how §24.10 — "every question says what to do when it doesn't
  // apply" — never once reached a session, silently.
  const bold = [...text.matchAll(/^\*\*(.+?)\*\*/gms)].map((m) => m[1]);
  const headings = [...text.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1]);
  const bullets = [...text.matchAll(/^- \*\*(.+?)\*\*/gms)].map((m) => m[1]);
  const rules = [...new Set([...headings, ...bold, ...bullets])]
    .map((r) => r.replace(/\s+/g, " ").replace(/[.:]$/, "").trim())
    .filter((r) => r.length > 3 && r.length < 140);
  if (rules.length === 0) {
    return `\n   ${skill} — its SKILL.md has no headings or bold rules to extract. Load it before you continue.`;
  }
  // Everything, never a slice. The old cap of nine dropped §24.8, §24.9
  // and §24.11 off the end of the surface skill without a word — a hook whose
  // whole purpose is making a standard deterministic, quietly emitting
  // two thirds of it. If a checklist is long, that is a fact about the
  // standard, not a reason to hide part of it.
  return `\n   ${skill} — its own checklist, so you do not have to load it:\n${rules
    .map((r) => `     · ${r}`)
    .join("\n")}`;
}

let payload = "";
process.stdin.on("data", (chunk) => (payload += chunk));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(payload);
  } catch {
    process.exit(0);
  }
  // Path rules below are project-relative. cwd is NOT guaranteed to be the
  // project root (the script path itself uses $CLAUDE_PROJECT_DIR); if the
  // two ever differed, every ^src/ rule silently matched nothing and this
  // hook became a no-op with exit 0 — the worst failure mode a guard has.
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  // A Bash heredoc governs the same file an Edit does. Matching only
  // Edit|Write|MultiEdit let a whole slice through without one checklist
  // (2026-08-23).
  const targets = writtenPaths(input, root);
  if (targets.length === 0) process.exit(0);
  const notes = [];

  for (const rel of targets) {
    const file = rel.startsWith("/") ? rel : `${root}/${rel}`;
    const source = (() => {
      try {
        return readFileSync(file, "utf8");
      } catch {
        return "";
      }
    })();

    if (/^src\/app\/.*actions\.ts$/.test(rel) || /route\.ts$/.test(rel)) {
      notes.push(
        "Server action/route touched → SPEC §25: return typed results, never throw for expected failure." +
          checklist("error-handling"),
      );
    }
    if (/^src\/app\/.*\.tsx$/.test(rel)) {
      // A new surface gets the whole standard; an edit to an existing one
      // gets a two-line pointer. 25 bullets on a one-line import fix taught
      // sessions to skim past the block — which un-teaches the standard.
      const isNew =
        source.split("\n").length < 40 || !source.includes("export");
      notes.push(
        isNew
          ? "New surface → SPEC §23/§24 apply in full." + checklist("ui-craft")
          : "Surface edited → SPEC §23/§24: designed states, accessible names, no internal identifiers, state never colour alone. Full standard: pass 1–3 of the ui-craft skill.",
      );
    }
    if (
      /^src\/lib\/(intake|instrument|severity).*\.ts$/.test(rel) ||
      /^src\/data\/(instrument|reference)\//.test(rel)
    ) {
      // The instrument LIVES in src/data — the old rule matched only src/lib,
      // so editing gates.json or severity.json fired nothing at all (operating
      // layer audit, 2026-08-23). The content is the governed thing.
      notes.push(
        "Instrument or reference data touched → SPEC §8: bump the version string (activated versions are immutable), run `pnpm instrument:seed`, update the pinned test in the same commit, record a governance entry." +
          checklist("instrument"),
      );
    }
    if (/^\.claude\/(agents|skills)\//.test(rel)) {
      notes.push(
        "Agent or skill changed → run `pnpm agent-map` so docs/agent-map.html and the in-app transparency page match. test/unit/agent-map.test.ts fails the build until you do.",
      );
    }
    if (/^CLAUDE\.md$/.test(rel) && /— DONE/.test(source)) {
      notes.push(
        "Slice status changed → demo/readiness.md must cover it: which beat does this add or change, is it built, has a person walked it, what is the fallback if it breaks live. The stop gate refuses to finish until it does (G-44).",
      );
    }
    if (/^demo\/readiness\.md$/.test(rel)) {
      notes.push(
        "Demo readiness edited → say it to the owner in the reply, not just in the file. A beat nobody has walked is not ready, however green the tests are.",
      );
    }
    if (/^drizzle\//.test(rel)) {
      notes.push(
        "Migration touched → SPEC §26.5: append a new file, never edit an applied one, and mirror it in src/lib/schema.ts.",
      );
    }
    if (source.includes("process.env") && rel !== "src/lib/config.ts") {
      notes.push(
        "BLOCKED BY TEST: process.env outside src/lib/config.ts violates SPEC §26.3 — test/unit/architecture.test.ts will fail.",
      );
    }
    if (/^src\//.test(rel) && source.split("\n").length > 400) {
      notes.push(
        `File budget: ${rel} is ${source.split("\n").length} lines (SPEC §11 ceiling: 400 new / 800 hard).`,
      );
    }
  }

  if (notes.length) {
    // Same file touched twice in one command should not say it twice.
    console.error([...new Set(notes)].map((n) => `• ${n}`).join("\n"));
    process.exit(2); // surfaced to the model as feedback, not a failure
  }
  process.exit(0);
});
