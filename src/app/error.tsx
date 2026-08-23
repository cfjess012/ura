"use client";

import Link from "next/link";
import * as React from "react";

/**
 * The unexpected-failure boundary (SPEC §25, F3).
 *
 * Next's default screen prints a bare `Digest: 1256314211` under a stack
 * trace — internal detail on a requester's screen, and no answer to the only
 * question they actually have: *did I just lose my work?* This screen answers
 * it, then hands them the same reference the server log already carries, so a
 * support conversation starts with a fact instead of a re-enactment.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // The console is the operator's. The screen above is the requester's.
    console.error("[render]", error);
    // A boundary is a client component and cannot export metadata, so the
    // tab title is set here — otherwise navigating into failure announces
    // nothing at all to anyone reading the title (N10).
    document.title = "Something went wrong — Front Door AI Risk Advisor";
  }, [error]);

  return (
    <main>
      <p className="eyebrow">Something went wrong</p>
      <h1 className="display">This screen didn&rsquo;t load</h1>
      <p className="lede">
        The failure happened while drawing the page, not while saving. Every
        answer you had already submitted is recorded and safe.
      </p>
      <div className="card recover">
        <h2>What to do</h2>
        <ol className="summary-list">
          <li>Try loading the screen again — most of these are momentary.</li>
          <li>
            If it happens twice, open your assessments and continue from
            there; the work is where you left it.
          </li>
          <li>
            Still stuck? Quote the reference below — it matches a line in the
            server log.
          </li>
        </ol>
        <div className="savebar">
          <button type="button" className="btn" onClick={reset}>
            Try again
          </button>
          <Link href="/projects" className="btn ghost">
            Go to my assessments
          </Link>
          {error.digest && (
            <span className="err-ref">Reference {error.digest}</span>
          )}
        </div>
      </div>
    </main>
  );
}
