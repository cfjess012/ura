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

/**
 * A skill's checklist: its headline rules, not the whole file. Enough to act
 * on without flooding the context of a one-line edit.
 */
function checklist(skill) {
  try {
    const text = readFileSync(join(process.cwd(), ".claude", "skills", skill, "SKILL.md"), "utf8");
    // Skills are written as prose under headings, so the headings ARE the
    // checklist. Bold leads are used too; take whichever the file has.
    const bold = [...text.matchAll(/^\*\*(.+?)\*\*/gm)].map((m) => m[1]);
    const headings = [...text.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1]);
    const bullets = [...text.matchAll(/^- \*\*(.+?)\*\*/gm)].map((m) => m[1]);
    const rules = [...new Set([...headings, ...bold, ...bullets])]
      .map((r) => r.replace(/\s+/g, " ").replace(/[.:]$/, "").trim())
      .filter((r) => r.length > 3 && r.length < 140)
      .slice(0, 9);
    if (rules.length === 0) return "";
    return `\n   ${skill} — its own checklist, so you do not have to load it:\n${rules
      .map((r) => `     · ${r}`)
      .join("\n")}`;
  } catch {
    return "";
  }
}

let payload = "";
process.stdin.on("data", (chunk) => (payload += chunk));
process.stdin.on("end", () => {
  let file = "";
  try {
    file = JSON.parse(payload)?.tool_input?.file_path ?? "";
  } catch {
    process.exit(0);
  }
  if (!file) process.exit(0);
  const rel = file.replace(`${process.cwd()}/`, "");
  const notes = [];

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
    notes.push(
      "Surface touched → SPEC §23/§24: designed empty/loading/error states, accessible names, no internal identifiers." +
        checklist("ui-craft") +
        checklist("ux-audit"),
    );
  }
  if (/^src\/lib\/(intake|instrument).*\.ts$/.test(rel)) {
    notes.push(
      "Instrument data touched → SPEC §8: update the pinned field-set test in the same commit and record a governance entry." +
        checklist("instrument-change"),
    );
  }
  if (/^\.claude\/(agents|skills)\//.test(rel)) {
    notes.push("Agent or skill changed → run `pnpm agent-map` so docs/agent-map.html and the in-app transparency page match. test/unit/agent-map.test.ts fails the build until you do.");
  }
  if (/^drizzle\//.test(rel)) {
    notes.push("Migration touched → SPEC §26.5: append a new file, never edit an applied one, and mirror it in src/lib/schema.ts.");
  }
  if (source.includes("process.env") && rel !== "src/lib/config.ts") {
    notes.push("BLOCKED BY TEST: process.env outside src/lib/config.ts violates SPEC §26.3 — test/unit/architecture.test.ts will fail.");
  }
  if (/^src\//.test(rel) && source.split("\n").length > 400) {
    notes.push(`File budget: ${rel} is ${source.split("\n").length} lines (SPEC §11 ceiling: 400 new / 800 hard).`);
  }

  if (notes.length) {
    console.error(notes.map((n) => `• ${n}`).join("\n"));
    process.exit(2); // surfaced to the model as feedback, not a failure
  }
  process.exit(0);
});
