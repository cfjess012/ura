"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { acceptDraft } from "@/app/agent-actions";
import { isFailure } from "@/lib/errors";

/**
 * An answer the assistant proposed, waiting for the person to accept it.
 *
 * Three things this has to do, and they are all the same thing said
 * differently: say **who proposed it** so nobody mistakes it for their own
 * answer, show **the sentence it came from** so they can check it in a
 * second rather than take it on faith, and make accepting an **explicit
 * act** so the record can tell a proposal apart from a decision (FR-22, §7).
 *
 * Accepting writes a new row; the proposal stays on the record underneath
 * it. "The assistant proposed and I accepted" is then a history somebody
 * can read, not a claim they have to believe.
 */
export function ProposedAnswer({
  projectId,
  questionId,
  value,
  quote,
  source,
  basis,
}: {
  projectId: string;
  questionId: string;
  value: string;
  quote: string;
  source: string;
  basis: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const result = await acceptDraft(projectId, questionId);
      if (isFailure(result)) {
        setError(result.message);
        return;
      }
      router.refresh();
    } catch (cause) {
      console.error("acceptDraft transport", cause);
      setError("That couldn't be saved just now. The proposal is still here.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="proposed">
      <p className="proposed-mark">
        <span aria-hidden="true">✨</span> Proposed by the assistant — not your
        answer yet
      </p>
      <p className="proposed-value">
        It suggests <strong>{value}</strong>
        {basis === "inferred"
          ? ", reading between the lines of this:"
          : ", from this:"}
      </p>
      <blockquote className="proposed-quote">“{quote}”</blockquote>
      <p className="help">
        From {source}. Check it says what the assistant thinks it says — the
        quote is copied word for word, but whether it answers this question is
        your call.
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="proposed-actions">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void accept()}
        >
          {busy ? "Accepting…" : `Accept ${value}`}
        </button>
        <span className="help">
          Or just answer it yourself below — that replaces this.
        </span>
      </div>
    </div>
  );
}
