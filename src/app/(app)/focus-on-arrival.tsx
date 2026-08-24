"use client";

/**
 * Land the person ON the thing (skill: alert-destination).
 *
 * An alert names a question and then has to deliver you to it: scrolled
 * into view, marked, and holding keyboard focus. Marking is never colour
 * alone — the marked element gets a visible outline and an announcement.
 *
 * One-time by design. Focus is an act on arrival, not a state of the page:
 * re-marking the same thing every time somebody comes back would be a
 * highlight that never goes away.
 */
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { FOCUS } from "@/lib/destination";

export function FocusOnArrival() {
  const params = useSearchParams();
  const wanted = params.get(FOCUS);
  const [missing, setMissing] = React.useState(false);

  React.useEffect(() => {
    if (!wanted) return;
    const target = document.querySelector<HTMLElement>(
      `[data-focus="${CSS.escape(wanted)}"]`,
    );
    if (!target) {
      // Honest failure: the alert sent us somewhere the thing is not.
      // Saying so beats leaving a person on a screen with no idea why.
      setMissing(true);
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("landed");
    const focusable = target.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]",
    );
    (focusable ?? target).focus?.({ preventScroll: true });
    const done = window.setTimeout(
      () => target.classList.remove("landed"),
      2600,
    );
    return () => window.clearTimeout(done);
  }, [wanted]);

  if (!missing) return null;
  return (
    <p className="card card-upcoming" role="status">
      We brought you here for a question that isn&rsquo;t on this screen any
      more — it may have been answered, or the assessment may have changed
      since. Nothing is lost; carry on where you are.
    </p>
  );
}
