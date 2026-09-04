import * as React from "react";

/**
 * One collapsed section of the record behind the standing (G-91).
 *
 * A native `<details>` rather than a toggle of our own: it is keyboard
 * operable, it announces its expanded state to assistive technology, and it
 * is searchable in-page by the browser — three things a hand-built
 * disclosure has to earn back and usually doesn't.
 *
 * Closed by default. What is inside is real and a reviewer wants it; a
 * requester finishing their work does not, and putting it on the page
 * unasked is what made this screen three scrolls long.
 */
export function Detail({
  summary,
  count,
  children,
}: {
  summary: string;
  /** What is inside, in one short phrase, so the row is worth deciding on. */
  count?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="standing-detail-block">
      <summary>
        <span className="standing-summary-text">{summary}</span>
        {count && <span className="standing-summary-count">{count}</span>}
      </summary>
      <div className="standing-detail-body">{children}</div>
    </details>
  );
}
