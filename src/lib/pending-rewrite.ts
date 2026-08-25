/**
 * A suggested rewrite, carried from the check to the field it belongs to.
 *
 * The check runs at the foot of the last section; the field it rewrites is
 * usually on the first. So the suggestion has to survive a navigation — and
 * it travels in session storage rather than through the record, because
 * **a suggestion is not an answer** until somebody saves it. Putting it in
 * the database on the way past would make the platform the author of a
 * sentence they are about to attest to.
 *
 * Session storage is per tab and dies with it, which is exactly the
 * lifetime wanted: if they close the page, the suggestion was never taken.
 */
const KEY = "ura.pending-rewrite";

export type PendingRewrite = {
  projectId: string;
  fieldId: string;
  text: string;
  /** What each bracket is asking for, so the field can point at them. */
  placeholders: string[];
};

export function holdRewrite(pending: PendingRewrite): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    // Private mode, storage disabled, quota. The navigation still happens
    // and the field is simply not pre-filled — worse, never broken.
  }
}

/** Read and clear. Taking it twice would re-apply it over their edits. */
export function takeRewrite(
  projectId: string,
  fieldIds: string[],
): PendingRewrite | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as PendingRewrite;
    if (pending.projectId !== projectId) return null;
    if (!fieldIds.includes(pending.fieldId)) return null;
    sessionStorage.removeItem(KEY);
    return pending;
  } catch {
    return null;
  }
}

/** Where each `[...]` sits in the text, for selecting the first one. */
export function bracketSpans(
  text: string,
): Array<{ from: number; to: number }> {
  // The ceiling was 200 and a real placeholder ran past it — a question
  // that quotes both halves of a contradiction is long by nature, and the
  // longest gaps are the ones somebody most needs to see. Missing one was
  // silent twice over: no highlight on it, and no line for it in the list
  // underneath. Still bounded, so an unclosed bracket cannot swallow the
  // rest of the document.
  return [...text.matchAll(/\[[^\]]{3,600}\]/g)].map((m) => ({
    from: m.index!,
    to: m.index! + m[0].length,
  }));
}
