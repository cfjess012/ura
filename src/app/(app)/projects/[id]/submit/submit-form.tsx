"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { submitAssessment } from "@/app/actions";
import { errorRef, isFailure } from "@/lib/errors";
import type { Declared, Gap } from "@/lib/submission";

/**
 * The declaration (FR-37, G-52) and the named-gaps confirmation (FR-14).
 *
 * One declaration over the answers shown, not eight tick-boxes: separate
 * boxes per question are ceremony people click through without reading,
 * which is the opposite of what a declaration is for (owner's call). What
 * makes it mean something is that the answers are on screen, in full, at
 * the moment of signing — and the same list is what gets recorded.
 */
export function SubmitForm({
  projectId,
  declarable,
  gaps,
  willRaise,
  nextHref,
}: {
  projectId: string;
  declarable: Declared[];
  gaps: Gap[];
  /** How many findings this will raise — said before, not after. */
  willRaise: number;
  nextHref: string;
}) {
  const router = useRouter();
  const [declared, setDeclared] = React.useState(false);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; ref?: string } | null>(null);

  const ready = declared && (gaps.length === 0 || acknowledged);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await submitAssessment(projectId, {
        shown: declarable,
        gapsAcknowledged: acknowledged,
      });
      if (isFailure(result)) {
        setError({ message: result.message, ref: result.ref });
        return;
      }
      router.push(nextHref);
      router.refresh();
    } catch (cause) {
      console.error("submitAssessment transport", cause);
      setError({
        message:
          "The server couldn't be reached, so nothing was submitted. Your answers are safe — try again in a moment.",
        ref: errorRef(),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="card">
        <h2>What you are declaring accurate</h2>
        <p className="help">
          These are the answers a reviewer starts from. Read them — if one is wrong,
          go back and change it before you sign.
        </p>
        <dl className="declared">
          {declarable.map((item) => (
            <div key={item.questionId}>
              <dt>{item.label}</dt>
              <dd className={item.value ? "" : "declared-blank"}>
                {item.value || "— not answered"}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {gaps.length > 0 && (
        /* Gaps are named, never counted (FR-14): "12 unanswered" is a
           number nobody can act on. The same list is stored with the
           declaration so a reviewer sees exactly what was known missing. */
        <div className="card gaps">
          <h2>
            {gaps.length} question{gaps.length === 1 ? "" : "s"} you have not answered
          </h2>
          <p className="help">
            You can submit anyway — a reviewer would rather see a gap than a guess.
            They will see this list exactly as it is.
          </p>
          <ul className="summary-list">
            {gaps.map((gap) => (
              <li key={gap.questionId}>{gap.label}</li>
            ))}
          </ul>
          <label className="confirm">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              I know these {gaps.length === 1 ? "is" : "are"} unanswered and I am submitting
              anyway.
            </span>
          </label>
        </div>
      )}

      <div className="card declare">
        <label className="confirm">
          <input
            type="checkbox"
            checked={declared}
            onChange={(event) => setDeclared(event.target.checked)}
          />
          <span>
            <strong>I declare these answers are accurate</strong> to the best of my
            knowledge, and I understand a reviewer will rely on them.
          </span>
        </label>

        {willRaise > 0 && (
          <p className="help" style={{ marginTop: "0.6rem" }}>
            Submitting raises {willRaise} finding{willRaise === 1 ? "" : "s"} from your
            control answers, {willRaise === 1 ? "carrying the note" : "each carrying the note"}{" "}
            you wrote.
          </p>
        )}

        <div className="savebar" style={{ marginTop: "0.9rem" }}>
          <span role="status" aria-live="polite" className={error ? "save-failed" : "saved"}>
            {busy ? (
              "Submitting…"
            ) : error ? (
              <>
                {error.message}{" "}
                {error.ref && <span className="err-ref">Reference {error.ref}</span>}
              </>
            ) : (
              ""
            )}
          </span>
          <button type="submit" className="btn" disabled={!ready || busy}>
            {busy ? "Submitting…" : "Declare and submit →"}
          </button>
        </div>
        {!ready && !busy && (
          <p className="help" style={{ marginTop: "0.4rem" }}>
            {declared
              ? "Confirm the unanswered questions above to submit."
              : "Tick the declaration to submit."}
          </p>
        )}
      </div>
    </form>
  );
}
