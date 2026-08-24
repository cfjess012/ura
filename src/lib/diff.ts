/**
 * Word-level diff, for showing what a person changed (SPEC §4.2).
 *
 * The classic longest-common-subsequence walk over word tokens. Words in
 * both sequences are `same`; words only on the left are `removed`; words
 * only on the right are `added`. Word granularity rather than character
 * granularity, because these are sentences a person wrote and a
 * character diff of a sentence is unreadable.
 *
 * Salvaged from the prior platform (G-63), which used it for draft-versus-
 * attested. Here it answers the same question one act later: a reviewer
 * corrects an answer and re-signs it, and the record has to show what
 * actually changed rather than only that something did.
 *
 * Pure: no framework, no driver, no environment (§26.1).
 */
export type DiffOp = { type: "same" | "added" | "removed"; text: string };

export function diffWords(before: string, after: string): DiffOp[] {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  const n = a.length;
  const m = b.length;

  // lcs[i][j] — the length of the longest common subsequence of a[i..] and
  // b[j..]. Filled from the end so the walk below can read it forwards.
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ type: "removed", text: a[i]! });
      i++;
    } else {
      ops.push({ type: "added", text: b[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ type: "removed", text: a[i++]! });
  while (j < m) ops.push({ type: "added", text: b[j++]! });
  return ops;
}

/** Did anything actually change? Used to decide whether to show a diff. */
export function isUnchanged(ops: DiffOp[]): boolean {
  return ops.every((op) => op.type === "same");
}
