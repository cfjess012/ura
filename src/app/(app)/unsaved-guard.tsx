"use client";

/**
 * Asking before somebody walks away from answers that are not written down.
 *
 * Two halves of one job. `useHoldUnsaved` is what a screen with unsaved work
 * says; `SwitchUser` is one of the places that listens. The browser's close
 * and reload listen too, from `lib/unsaved-work.ts`, which is the only guard
 * a page can put on them.
 */
import * as React from "react";
import {
  holdUnsaved,
  unsavedWork,
  type SaveResult,
  type UnsavedWork,
} from "@/lib/unsaved-work";

/**
 * Hold this screen's unsaved work while there is any, and let it go the
 * moment there isn't — including on the way out, so a screen that unmounts
 * cannot leave a stale warning armed over the next one.
 */
export function useHoldUnsaved(
  dirty: boolean,
  what: string,
  save: () => Promise<SaveResult>,
): void {
  // The save closes over what has been typed, and they are still typing.
  // Captured once when the work was published it would write the answers as
  // they stood the moment the field first went dirty — silently older than
  // the screen. Re-pointed after every render instead.
  const latest = React.useRef(save);
  React.useEffect(() => {
    latest.current = save;
  });
  React.useEffect(() => {
    if (!dirty) return;
    holdUnsaved({ what, save: () => latest.current() });
    return () => holdUnsaved(null);
  }, [dirty, what]);
}

/**
 * The app bar's way out (§24.4). It is a server action in the layout, so the
 * interception is on the button rather than the form — calling `requestSubmit`
 * afterwards would re-enter a guard placed on submit and never let anybody
 * leave.
 */
export function SwitchUser({ action }: { action: () => void | Promise<void> }) {
  const form = React.useRef<HTMLFormElement>(null);
  const [asking, setAsking] = React.useState<UnsavedWork | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [refused, setRefused] = React.useState<{
    message: string;
    ref?: string;
  } | null>(null);

  const go = () => {
    setAsking(null);
    form.current?.requestSubmit();
  };

  return (
    <>
      <form ref={form} action={action}>
        <button
          type="submit"
          className="appbar-leave"
          onClick={(event) => {
            const work = unsavedWork();
            if (!work) return;
            event.preventDefault();
            setRefused(null);
            setAsking(work);
          }}
        >
          Switch user
        </button>
      </form>

      {asking && (
        <div className="leaving" role="dialog" aria-modal="true">
          <div className="leaving-card">
            <p className="leaving-title">You have answers not saved yet</p>
            <p className="help">
              Switching user leaves {asking.what} as it was last saved. Nothing
              you have typed since then would be kept.
            </p>
            {/* A refusal is a designed state, not a dead end: the reason and
                its reference, on the dialog that caused it, because the save
                bar that would normally carry them is behind this. */}
            {refused && (
              <p className="leaving-refused" role="alert">
                {refused.message}{" "}
                {refused.ref && (
                  <span className="err-ref">Reference {refused.ref}</span>
                )}
              </p>
            )}
            <div className="leaving-actions">
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  setRefused(null);
                  try {
                    const result = await asking.save();
                    if (result.ok) go();
                    else setRefused(result);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Saving…" : "Save and switch user"}
              </button>
              <button
                type="button"
                className="link-button"
                disabled={saving}
                onClick={go}
              >
                Switch without saving
              </button>
              <button
                type="button"
                className="link-button"
                disabled={saving}
                onClick={() => setAsking(null)}
              >
                Stay here
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
