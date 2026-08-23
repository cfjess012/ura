#!/usr/bin/env node
/**
 * PreToolUse guard (SPEC §15, promised since S1 and built 2026-08-23).
 *
 * The advise hook reminds AFTER an edit lands; these three are the edits
 * where after is too late. Exit 2 blocks the tool call with the reason.
 *
 * Deliberately narrow: a guard that false-blocks gets disabled, and a
 * disabled guard is worse than none (the Stop gate was deleted once).
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

let payload = "";
process.stdin.on("data", (c) => (payload += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(payload);
  } catch {
    process.exit(0);
  }
  const file = input?.tool_input?.file_path ?? "";
  if (!file) process.exit(0);
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const rel = file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file;

  // 1. An applied migration is history, not a draft (§26.5). "Applied" is
  // approximated as "tracked by git" — a migration is committed with the
  // slice that ran it, so an untracked drizzle file is a new one being
  // written, which is exactly what IS allowed.
  if (/^drizzle\/.*\.sql$/.test(rel) && existsSync(file)) {
    let tracked = false;
    try {
      execFileSync("git", ["-C", root, "ls-files", "--error-unmatch", rel], {
        stdio: "ignore",
      });
      tracked = true;
    } catch {
      /* untracked → new file → allowed */
    }
    if (tracked) {
      console.error(
        `BLOCKED: ${rel} is an applied migration. Append a new numbered file instead (SPEC §26.5) and mirror it in src/lib/schema.ts.`,
      );
      process.exit(2);
    }
  }

  // 2. Environment files hold credentials and are gitignored by design.
  if (/(^|\/)\.env(\.|$)/.test(rel) || /(^|\/)\.env$/.test(rel)) {
    console.error(
      `BLOCKED: ${rel} is an environment file — edited by the owner, never by a session (SPEC §26.3). Say what to put in it instead.`,
    );
    process.exit(2);
  }

  // 3. A settled governance entry may be compressed or superseded, never
  // silently deleted: an Edit whose old_string contains a settled entry's
  // marker must keep that G-id present in the replacement (Build Rule 10).
  if (/^SPEC\.md$/.test(rel) && input?.tool_input?.old_string) {
    const oldS = input.tool_input.old_string;
    const newS = input.tool_input.new_string ?? "";
    const settled = [...oldS.matchAll(/\*\*(G-\d+a?) \((?:settled|superseded[^)]*)\)/g)].map(
      (m) => m[1],
    );
    const dropped = settled.filter((g) => !newS.includes(g));
    if (dropped.length) {
      console.error(
        `BLOCKED: this edit deletes governance entr${dropped.length === 1 ? "y" : "ies"} ${dropped.join(", ")} from SPEC §13. A settled decision is compressed or marked superseded — never removed (Build Rule 10). If superseding, keep the id and mark it.`,
      );
      process.exit(2);
    }
  }

  process.exit(0);
});
