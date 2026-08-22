/**
 * Which slices CLAUDE.md says are finished — one parser, used by the Stop
 * gate and by every test that asks the same question.
 *
 * There used to be two regexes for this. Each had a different hole, and
 * neither was the union: the gate's `/\b(S[\d.]+)[^—\n]{0,40}— DONE/`
 * missed any slice whose name ran past forty characters, and the test's
 * `/^- (S\d+) [^—]*— DONE/m` could not match a dotted id at all — so the
 * real `S2.5` line was already invisible to it and survived only because
 * the other regex was laxer. An independent verifier walked a fake DONE
 * slice past both with an ASCII hyphen, with a bolded **DONE**, and with a
 * dotted id plus a long name.
 *
 * So this reads the way a person reads: find the slice-status block, split
 * each line into the entries it packs, and take the id from any entry that
 * says DONE. No length window, no dash-character assumption, no bold
 * assumption.
 */

/** The `## Slice status` block, or the whole document if it has none. */
export function sliceStatusBlock(claudeMd) {
  const start = claudeMd.indexOf("## Slice status");
  if (start === -1) return claudeMd;
  const rest = claudeMd.slice(start + "## Slice status".length);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

/** Slice ids marked DONE, in the order they appear, without duplicates. */
export function doneSlices(claudeMd) {
  const found = [];
  for (const line of sliceStatusBlock(claudeMd).split("\n")) {
    // One line can carry several slices, separated by a middot.
    for (const entry of line.split("·")) {
      // DONE as a word, however it is decorated: **DONE**, `DONE`, DONE.
      if (!/\bDONE\b/.test(entry.replace(/[*`_]/g, ""))) continue;
      const id = entry.match(/\bS\d+(?:\.\d+)*/)?.[0];
      if (id && !found.includes(id)) found.push(id);
    }
  }
  return found;
}
