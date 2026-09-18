"use client";

import * as React from "react";

/**
 * What a person sees when the AI check did not run (SPEC §25, §24.4).
 *
 * The whole of this used to be one grey line — "I couldn't check this one
 * just now" — set in the same muted help style as a hint, below the fold,
 * for every cause there is. The owner clicked the button, saw nothing move,
 * and reported that nothing happened; the sentence was on the page and had
 * failed to be a message.
 *
 * So: an outcome that looks like an outcome, in a live region, saying which
 * fault it was, whether the work is safe, and what to do next. `Try again`
 * appears only where trying again could work — a rejected API key and a
 * stopped service are not waiting problems, and inviting four clicks at one
 * teaches somebody the product is broken.
 *
 * It still does not gate anything (G-69). The line about carrying on is the
 * point of the panel, not a consolation at the end of it: the check is
 * advisory, and a person who never gets an answer out of it must still be
 * able to finish and submit.
 */
export type Stopped = {
  /** One sentence: what happened, whether their work is safe, what next. */
  message: string;
  /** Whether the same button press could plausibly work a second time. */
  retryable: boolean;
  /** Quotable on the phone; the same string is in the server log. */
  ref?: string;
};

export function CheckStopped({
  stopped,
  onRetry,
}: {
  stopped: Stopped;
  onRetry: () => void;
}) {
  const panel = React.useRef<HTMLDivElement>(null);

  /**
   * Bring it into view, because the button that raises it sits at the foot
   * of a long form under a sticky save bar — which is how the message that
   * was already on the page got reported as nothing having happened.
   *
   * Scrolled, never focused: the person did not ask to be moved, and
   * stealing focus from whatever they were editing to show them a notice
   * costs more than it gives. The live region announces it either way.
   */
  React.useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches;
    el.scrollIntoView({
      block: "center",
      behavior: still ? "auto" : "smooth",
    });
  }, []);

  return (
    <div
      ref={panel}
      className="check-stopped"
      role="status"
      aria-live="polite"
    >
      <p className="check-stopped-head">
        {/* Never colour alone (§23): the words say it, the mark repeats it. */}
        <span className="check-stopped-mark" aria-hidden="true">
          !
        </span>
        The check didn’t run
      </p>
      <p className="check-stopped-body">{stopped.message}</p>
      <p className="check-stopped-carry">
        Nothing here blocks you — carry on and submit, and a reviewer picks up
        anything thin.
      </p>
      {(stopped.retryable || stopped.ref) && (
        <p className="check-stopped-acts">
          {stopped.retryable && (
            <button type="button" className="btn btn-small" onClick={onRetry}>
              Try again
            </button>
          )}
          {stopped.ref && (
            <span className="check-stopped-ref">
              Reference <strong>{stopped.ref}</strong>
            </span>
          )}
        </p>
      )}
    </div>
  );
}
