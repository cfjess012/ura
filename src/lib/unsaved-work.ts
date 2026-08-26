/**
 * Answers typed but not yet written down, held where the chrome can see them.
 *
 * The intake saves on the way out of a section — on Next, on the rail, on the
 * AI check. That covers every way of leaving the *form* owns. It does not
 * cover the two that live outside it:
 *
 * - **Switch user** is rendered by the layout's app bar. It sits above every
 *   screen and knows nothing about the one below it, so the form cannot guard
 *   it and the app bar cannot see what would be lost.
 * - **Closing the tab, or reloading** is not in the page at all. Only
 *   `beforeunload` reaches it, and only the browser may word that prompt.
 *
 * So the screen holding unsaved work publishes it here, and whoever is about
 * to take somebody away asks first. A module-level register rather than a
 * context: exactly one screen is on top at a time, and threading a provider
 * through the layout would put a client boundary around the whole application
 * to carry one boolean.
 */

/** Why a save was refused, in the words the person should read (§25). */
export type SaveResult =
  | { ok: true }
  | { ok: false; message: string; ref?: string };

export type UnsavedWork = {
  /**
   * What is not written down, as it would be said out loud — "the Description
   * section". The screen supplies the phrase because only the screen knows
   * what it is showing.
   */
  what: string;
  /** Write it. A refusal keeps the person exactly where they are. */
  save: () => Promise<SaveResult>;
};

/** Announced as well as stored: the app bar is already mounted. */
export const UNSAVED_CHANGED = "ura:unsaved-changed";

let held: UnsavedWork | null = null;

/**
 * The browser's own guard. Its sentence cannot be set — every browser
 * substitutes its own — so this only decides *whether* it is asked.
 */
function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (!held) return;
  event.preventDefault();
  // Older Safari and Chrome read the return value rather than the prevented
  // default. Never shown; without it there is simply no prompt in those.
  event.returnValue = "";
}

/** Publish what would be lost, or `null` once it is on the record. */
export function holdUnsaved(work: UnsavedWork | null): void {
  const had = held !== null;
  held = work;
  if (typeof window === "undefined") return;
  if (work && !had)
    window.addEventListener("beforeunload", warnBeforeUnload);
  else if (!work && had)
    window.removeEventListener("beforeunload", warnBeforeUnload);
  window.dispatchEvent(new CustomEvent(UNSAVED_CHANGED));
}

/** What would be lost right now, read at the moment somebody tries to leave. */
export function unsavedWork(): UnsavedWork | null {
  return held;
}
