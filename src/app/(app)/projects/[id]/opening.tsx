"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * A wait that says something if it stops being a wait (§24.4).
 *
 * This route's whole body is a redirect, so its loading state is normally
 * on screen for a moment. When something stalls it is on screen forever —
 * and "Opening the assessment…" above three grey bars is indistinguishable
 * from a broken page, with nothing to click and nothing said. An owner hit
 * exactly that and reasonably concluded the app had hung.
 *
 * After a few seconds this stops pretending to be progress and offers the
 * way out. It never claims what went wrong, because it does not know.
 */
export function Opening() {
  const [slow, setSlow] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(timer);
  }, []);

  if (!slow) {
    return (
      <p className="loading-note" role="status">
        Opening the assessment&hellip;
      </p>
    );
  }

  return (
    <div className="loading-stalled" role="status">
      <p>
        <strong>This is taking longer than it should.</strong> Nothing has
        been lost — this screen only works out where to send you, so nothing
        was being saved.
      </p>
      <p>
        <a className="btn" href={pathname}>
          Try again
        </a>{" "}
        <a href="/projects">Back to your assessments</a>
      </p>
    </div>
  );
}
