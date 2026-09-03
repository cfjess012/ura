"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitAssessment } from "@/app/actions";
import { errorRef, isFailure } from "@/lib/errors";
import type { Destination } from "@/lib/destination";
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
  /** Each with the way to it, where the question has a screen of its own. */
  gaps: Array<Gap & { destination: Destination | null }>;
  /** How many findings this will raise — said before, not after. */
  willRaise: number;
  nextHref: string;
}) {
  const router = useRouter();
  const [declared, setDeclared] = React.useState(false);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{
    message: string;
    ref?: string;
  } | null>(null);

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
          These are the answers a reviewer starts from. Read them — if one is
          wrong, go back and change it before you sign.
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
           declaration so a reviewer sees exactly what was known missing.

           Each one is a row with its own door. The list used to be bullets
           in an orange box with no way to any of them, on the one screen a
           person cannot leave without signing — and the confirmation read
           "I know these is unanswered". A warning state, still, and never
           colour alone: the count, the heading and the numbered rows say
           what this is. The band at the foot is the act, and it changes
           when the act is done. */
        <section className="card gaps gap-card" aria-labelledby="gaps-title">
          <header className="gap-card-head">
            <span className="gap-card-count" aria-hidden="true">
              {gaps.length}
            </span>
            <div>
              <h2 id="gaps-title" className="gap-card-title">
                {gaps.length === 1
                  ? "One question you haven’t answered"
                  : `${gaps.length} questions you haven’t answered`}
              </h2>
              <p className="gap-card-lede">
                A reviewer would rather see a gap than a guess. They will see
                this list exactly as it is.
              </p>
            </div>
          </header>
          <ol className="gap-list">
            {gaps.map((gap, at) => (
              <li key={gap.questionId} className="gap-row">
                <span className="gap-row-num" aria-hidden="true">
                  {at + 1}
                </span>
                <div className="gap-row-body">
                  <p className="gap-row-q">{gap.label}</p>
                  {gap.destination && (
                    <p className="gap-row-where">{gap.destination.label}</p>
                  )}
                </div>
                {gap.destination && (
                  <Link className="gap-row-go" href={gap.destination.href}>
                    Answer it →
                  </Link>
                )}
              </li>
            ))}
          </ol>
          <label className="confirm gap-confirm">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              <strong>
                {gaps.length === 1
                  ? "I know this question is unanswered"
                  : `I know these ${gaps.length} questions are unanswered`}
              </strong>{" "}
              and I’m submitting anyway.
              <span className="gap-confirm-note">
                {acknowledged
                  ? "Recorded with your declaration — it is not an answer."
                  : "Confirming records the gap with your declaration. It is not an answer."}
              </span>
            </span>
          </label>
        </section>
      )}

      <div className="card declare">
        <label className="confirm">
          <input
            type="checkbox"
            checked={declared}
            onChange={(event) => setDeclared(event.target.checked)}
          />
          <span>
            <strong>I declare these answers are accurate</strong> to the best of
            my knowledge, and I understand a reviewer will rely on them.
          </span>
        </label>

        {willRaise > 0 && (
          <p className="help" style={{ marginTop: "0.6rem" }}>
            Submitting raises {willRaise} finding{willRaise === 1 ? "" : "s"}{" "}
            from your control answers,{" "}
            {willRaise === 1 ? "carrying the note" : "each carrying the note"}{" "}
            you wrote.
          </p>
        )}

        <div className="savebar" style={{ marginTop: "0.9rem" }}>
          <span
            role="status"
            aria-live="polite"
            className={error ? "save-failed" : "saved"}
          >
            {busy ? (
              "Submitting…"
            ) : error ? (
              <>
                {error.message}{" "}
                {error.ref && (
                  <span className="err-ref">Reference {error.ref}</span>
                )}
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
