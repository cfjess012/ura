/**
 * Which files a tool call is about to write.
 *
 * The hooks matched `Edit|Write|MultiEdit` only. A session that edits through
 * Bash — heredocs, `sed -i`, a Python one-liner — wrote the entire SPEC
 * rewrite, the skill merges and a whole slice without either hook firing
 * once. A guard that the work can walk around without noticing is not a
 * guard, so this module answers the same question for both shapes of call
 * (found 2026-08-23, by the session that did it).
 *
 * Deliberately conservative on Bash: it recognises the write forms actually
 * used here rather than trying to parse a shell. A missed path is a hook
 * that stays quiet; a wrongly-matched path is a blocked command and a
 * disabled guard, and the second failure is worse than the first.
 */

/** Strip one layer of quoting and any trailing shell noise. */
const clean = (raw) =>
  raw
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/[;&|)]+$/, "");

const PATTERNS = [
  // cat > file, echo ... >> file, node script > file
  /(?:^|\s)>>?\s*(['"]?[\w./@()\[\]-]+['"]?)/g,
  // tee file, tee -a file
  /\btee\s+(?:-a\s+)?(['"]?[\w./@()\[\]-]+['"]?)/g,
  // sed -i file (GNU) and sed -i '' file (BSD/macOS)
  /\bsed\s+(?:-[a-zA-Z]*\s+)*-i(?:\s+(?:''|""))?\s+(?:-e\s+\S+\s+)?(?:\S+\s+)?(['"]?[\w./@()\[\]-]+['"]?)\s*$/gm,
  // python: open("file", "w"|"a")
  /\bopen\(\s*(['"][\w./@()\[\]-]+['"])\s*,\s*['"][wa]/g,
  // node: writeFileSync("file"
  /\bwriteFileSync\(\s*(['"][\w./@()\[\]-]+['"])/g,
  // cp src dst / mv src dst — the destination is what changes
  /\b(?:cp|mv)\s+(?:-\w+\s+)*\S+\s+(['"]?[\w./@()\[\]-]+['"]?)/g,
  // rm file — deletion is a write
  /\brm\s+(?:-\w+\s+)*(['"]?[\w./@()\[\]-]+['"]?)/g,
];

/**
 * Paths a Bash command appears to write, project-relative where possible.
 * Never throws: a hook that dies on an odd command is a hook that is off.
 */
export function writtenByCommand(command, root) {
  if (typeof command !== "string" || command.length === 0) return [];
  const found = new Set();
  for (const pattern of PATTERNS) {
    for (const match of command.matchAll(pattern)) {
      const path = clean(match[1] ?? "");
      // /dev/null and bare fd redirections are not files anyone governs.
      if (!path || path.startsWith("/dev/") || /^\d+$/.test(path)) continue;
      found.add(relative(path, root));
    }
  }
  return [...found];
}

/** Project-relative, whether the command used an absolute or relative path. */
export function relative(path, root) {
  if (root && path.startsWith(`${root}/`)) return path.slice(root.length + 1);
  return path.replace(/^\.\//, "");
}

/**
 * The one entry point both hooks use: every path this tool call writes,
 * whatever tool it is.
 */
export function writtenPaths(input, root) {
  const direct = input?.tool_input?.file_path;
  if (direct) return [relative(direct, root)];
  return writtenByCommand(input?.tool_input?.command, root);
}
