"use client";

/**
 * The autosave the assessment screens share (§24.3, §24.4, G-42).
 *
 * - a save as the person works writes only what they have **touched**;
 *   submitting is a different act and covers the whole screen (G-42);
 * - the forward control **waits** for a save already in flight rather than
 *   being disabled — a disabled control that swallows a click is the one
 *   thing §24.3 says a control must never do;
 * - a retryable failure keeps the forward control; a non-retryable one is
 *   replaced by the control the message tells the person to press;
 * - nothing here clears, resets or reloads state, so the person's input
 *   survives any failure.
 *
 * Each screen still owns what only it knows: what to write, and the
 * sentence it puts beside the save state.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { errorRef, isFailure, type Result } from "@/lib/errors";

export type SaveFailure = { message: string; ref?: string; retryable: boolean };

/** A screen's write. `null` means there was nothing to write — not a failure. */
export type Write = () => Promise<Result<unknown> | null>;

export function useAutosave({
  where,
  transportMessage,
}: {
  /** Stable label for the log, e.g. "answerPaths". */
  where: string;
  /** What the person reads when the server could not be reached at all. */
  transportMessage: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<SaveFailure | null>(null);
  const inFlight = React.useRef<Promise<boolean> | null>(null);
  /** What this person has actually touched. Only that is autosaved (G-42). */
  const touched = React.useRef<Set<string>>(new Set());

  async function write(run: Write): Promise<boolean> {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await run();
      if (result === null) return true;
      if (isFailure(result)) {
        setError({
          message: result.message,
          ref: result.ref,
          retryable: result.retryable,
        });
        return false;
      }
      setSaved(true);
      return true;
    } catch (cause) {
      console.error(`${where} transport`, cause);
      setError({
        message: transportMessage,
        // A per-incident reference, not a class name: support needs to
        // correlate one person's report with one moment in the log.
        ref: errorRef(),
        retryable: true,
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** Save as the person works. Nothing awaits it here; the submit does. */
  /**
   * `revert` puts the screen back when the server refuses.
   *
   * Optimistic state without it leaves the consequences of an answer on
   * screen next to the sentence saying it was not recorded: a submitted
   * assessment showed six accumulated controls, a control count and a
   * revealed follow-up question, all derived from an answer the database
   * never received (verifier B5). The gate form already reverted; this
   * makes it the shared rule rather than one screen's good manners.
   */
  function save(run: Write, revert?: () => void) {
    const running = write(run);
    inFlight.current = running;
    void running
      .then((ok) => {
        if (!ok) revert?.();
      })
      .finally(() => {
        if (inFlight.current === running) inFlight.current = null;
      });
  }

  /** Finish what is in flight, write the whole screen, then move on. */
  async function submit(run: Write, nextHref: string) {
    if (inFlight.current) await inFlight.current;
    const done = write(run);
    inFlight.current = done;
    if (await done) router.push(nextHref);
    inFlight.current = null;
  }

  return {
    saving,
    saved,
    error,
    touched,
    save,
    submit,
    reload: () => router.refresh(),
  };
}

export type Autosave = ReturnType<typeof useAutosave>;

/** The one savebar: where the screen stands, what the save is doing, forward. */
export function SaveBar({
  state,
  status,
  submitLabel,
  blocked = false,
  ready = false,
}: {
  state: Autosave;
  /** What this screen says about itself — counts, reassurance, progress. */
  status: React.ReactNode;
  submitLabel: string;
  /**
   * True when the status is a refusal rather than a report. It gets the
   * warning treatment, because a message that says "you cannot go on yet"
   * reading the same as "3 of 6 answered" is not a refusal a person sees.
   */
  blocked?: boolean;
  /**
   * True when this screen has nothing left outstanding.
   *
   * The bar is sticky and reads the same whether there are six answers to
   * go or none, so the moment somebody finishes looks like every other
   * moment. This lifts it once — a calm, once-only signal that the way
   * forward is now the thing to do.
   */
  ready?: boolean;
}) {
  const { saving, saved, error, reload } = state;
  return (
    <div className={ready ? "savebar ready" : "savebar"}>
      <span className={blocked ? "missing blocked" : "missing"}>{status}</span>
      <span style={{ display: "flex", gap: "0.8rem", alignItems: "center" }}>
        <span
          role="status"
          aria-live="polite"
          className={error ? "save-failed" : "saved"}
        >
          {saving ? (
            "Saving…"
          ) : error ? (
            <>
              {error.message}{" "}
              {error.ref && (
                <span className="err-ref">Reference {error.ref}</span>
              )}
            </>
          ) : saved ? (
            "Saved"
          ) : (
            ""
          )}
        </span>
        {error && !error.retryable ? (
          /* The message tells them to reload; the control has to be the
             thing the message names. */
          <button className="btn" type="button" onClick={reload}>
            Reload the questions
          </button>
        ) : (
          <button className="btn" type="submit">
            {submitLabel}
          </button>
        )}
      </span>
    </div>
  );
}
