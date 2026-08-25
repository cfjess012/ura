/**
 * Which item a master-detail screen currently has open.
 *
 * The assistant knows where somebody is from the path, and for most screens
 * that is enough — one URL, one set of questions. The reviewer's queue is
 * the exception: nine controls live at one URL and exactly one is open, so
 * "the reviewer's queue" told the assistant nothing it could be right
 * about. Asked to explain the control on screen, it explained a different
 * one, with a real clause quoted from a real policy — confidently wrong,
 * which is worse than silent.
 *
 * What travels is an **id**, never the question's words. The rule that the
 * caller selects and the instrument supplies the text is the reason the
 * assistant cannot be made to talk about a question that does not exist,
 * and it survives intact: the server looks this id up before believing it.
 *
 * Module state plus an event, matching how a held rewrite already crosses
 * the same gap — the queue and the panel are siblings with no shared owner,
 * and threading a prop through the page would put the assistant's concerns
 * into the review screen's signature.
 */

const CHANGED = "ura:focus-changed";

let open: string | null = null;

/** Say which item is open. Pass null when nothing is. */
export function focusOn(questionId: string | null): void {
  if (open === questionId) return;
  open = questionId;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGED));
  }
}

/** What is open right now, if anything. */
export function focused(): string | null {
  return open;
}

/** Watch for changes. Returns the unsubscribe. */
export function onFocusChanged(run: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGED, run);
  return () => window.removeEventListener(CHANGED, run);
}
