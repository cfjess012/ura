"use client";

import * as React from "react";
import {
  checkIntake,
  suggestRewrite,
  type Suggestion,
} from "@/app/agent-actions";
import { isFailure } from "@/lib/errors";
import type { Coherence } from "@/lib/intake-rubric";

/**
 * The intake coherence check (FR-43).
 *
 * Reads the whole intake against a published rubric and says how it reads
 * to a reviewer who has not met you — a band, and the specific things
 * worth adding, each shown beside what full marks would look like.
 *
 * **It never blocks.** Everything here sits beside the form, not in front
 * of the button. A person who wants to write two lines and move on can, and
 * a reviewer picks up what is thin (G-69).
 */
export function CoherenceCheck({
  projectId,
  save,
  onRewrite,
}: {
  projectId: string;
  /** Puts a suggestion into the field, for them to edit. Never saves it. */
  onRewrite?: (fieldId: string, text: string) => void;
  /**
   * Saves what is on screen. The button says "Save & run AI check" and it
   * has to do both: the check reads the RECORD, so without saving first it
   * grades whatever was there before — which on a fresh section is nothing,
   * and the answer comes back "too thin to work from" about text the person
   * can see in front of them.
   */
  save: () => Promise<boolean>;
}) {
  const [result, setResult] = React.useState<Coherence | null>(null);
  const [running, setRunning] = React.useState(false);
  const [rewritable, setRewritable] = React.useState<string[]>([]);
  const resultRef = React.useRef<HTMLDivElement>(null);

  // Bring the answer into view. It renders below a long form, so on a full
  // section it landed off the bottom of the screen — and a check that
  // finished in two seconds looked like a button that did nothing.
  React.useEffect(() => {
    if (!result || running) return;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [result, running]);

  async function run() {
    if (running) return;
    setRunning(true);
    try {
      const saved = await save();
      if (!saved) {
        // The save reported its own failure on screen; adding a second
        // message about the check would bury it.
        setResult(null);
        return;
      }
      const outcome = await checkIntake(projectId);
      setResult(isFailure(outcome) ? null : outcome.coherence);
      setRewritable(isFailure(outcome) ? [] : outcome.rewritable);
    } catch (cause) {
      // Fails open, like everything else about this.
      console.error("checkIntake transport", cause);
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="coherence">
      <button
        type="button"
        className="ai-check"
        onClick={() => void run()}
        disabled={running}
      >
        <Sparkle />
        {running ? "Reading it…" : "Save & run AI check"}
      </button>

      {running && (
        <div className="coherence-pending" aria-live="polite">
          <span />
          <span />
          <span />
        </div>
      )}

      <div ref={resultRef}>
        {result && !running && (
          <Result
            result={result}
            projectId={projectId}
            rewritable={rewritable}
            onRewrite={onRewrite}
          />
        )}
      </div>
    </div>
  );
}

function Result({
  result,
  projectId,
  rewritable,
  onRewrite,
}: {
  result: Coherence;
  projectId: string;
  rewritable: string[];
  onRewrite?: (fieldId: string, text: string) => void;
}) {
  if (result.score === null && result.asks.length === 0) {
    return (
      <p className="help coherence-nocheck" role="status">
        I couldn&rsquo;t check this one just now — carry on, and a reviewer
        picks up anything thin.
      </p>
    );
  }

  return (
    <section className="coherence-result" aria-live="polite">
      {result.score !== null && result.band && (
        <div
          className={`coherence-band coherence-${result.band.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <p className="coherence-band-label">
            {result.band}
            <span className="coherence-score">
              {result.score}/{result.outOf}
            </span>
          </p>
          <p className="coherence-meaning">{result.meaning}</p>
        </div>
      )}

      {result.opening && <p className="coherence-opening">{result.opening}</p>}

      {result.asks.length === 0 ? (
        <p className="coherence-clear">
          <span aria-hidden="true">✓</span> Nothing outstanding — a reviewer can
          work from this as written.
        </p>
      ) : (
        <ul className="coherence-asks">
          {result.asks.map((ask) => (
            <li
              key={ask.id}
              className={
                ask.routing ? "coherence-ask routing" : "coherence-ask"
              }
            >
              <p className="coherence-ask-head">
                {ask.label}
                <span className="coherence-level">{ask.level} of 4</span>
                {ask.routing && (
                  <span className="coherence-routing">decides routing</span>
                )}
              </p>
              <p className="coherence-ask-body">{ask.sentence}</p>
              {ask.anchor && (
                <p className="coherence-anchor">
                  Full marks here: {ask.anchor}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Offered only where there is long-form text to work with and
          something to fix. It reorganises their words and brackets what is
          missing — it never invents a fact. */}
      {onRewrite && rewritable.length > 0 && result.asks.length > 0 && (
        <RewriteOffer
          projectId={projectId}
          fieldId={rewritable[0]!}
          shortfalls={result.asks.map((a) => ({
            label: a.label,
            ask: a.sentence,
            anchor: a.anchor,
          }))}
          onUse={(text) => onRewrite(rewritable[0]!, text)}
        />
      )}

      <p className="help">
        Suggestions, not requirements. You can submit as it stands.
      </p>
    </section>
  );
}

/** The mark on the button. Decorative — the label carries the meaning. */
function Sparkle() {
  return (
    <svg
      className="ai-check-spark"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 2.5l1.7 4.6 4.6 1.7-4.6 1.7-1.7 4.6-1.7-4.6L5.7 8.8l4.6-1.7L12 2.5z"
      />
      <path
        fill="currentColor"
        d="M18.5 14l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4z"
      />
      <path
        fill="currentColor"
        d="M5 14.5l.7 1.8 1.8.7-1.8.7L5 19.5l-.7-1.8-1.8-.7 1.8-.7.7-1.8z"
      />
    </svg>
  );
}

/**
 * A suggested rewrite, offered and never applied.
 *
 * It reorganises what the person wrote and marks what is missing with a
 * bracketed placeholder. Nothing is saved until they choose to use it, and
 * even then it goes into the field for them to edit rather than into the
 * record (§7, FR-22).
 */
function RewriteOffer({
  projectId,
  fieldId,
  shortfalls,
  onUse,
}: {
  projectId: string;
  fieldId: string;
  shortfalls: Array<{ label: string; ask: string; anchor: string }>;
  onUse: (text: string) => void;
}) {
  const [suggestion, setSuggestion] = React.useState<Suggestion | null>(null);
  const [asking, setAsking] = React.useState(false);
  const [nothing, setNothing] = React.useState(false);

  async function ask() {
    if (asking) return;
    setAsking(true);
    setNothing(false);
    try {
      const outcome = await suggestRewrite(projectId, fieldId, shortfalls);
      const offered = isFailure(outcome) ? null : outcome.suggestion;
      setSuggestion(offered);
      setNothing(offered === null);
    } catch (cause) {
      console.error("suggestRewrite transport", cause);
      setNothing(true);
    } finally {
      setAsking(false);
    }
  }

  if (suggestion) {
    return (
      <div className="rewrite">
        <p className="rewrite-title">A suggested rewrite</p>
        <p className="rewrite-body">{suggestion.rewrite}</p>
        {suggestion.placeholders.length > 0 && (
          <p className="help">
            The parts in [brackets] are things you have not said yet — it will
            not invent them. Fill them in and they disappear.
          </p>
        )}
        {suggestion.kept && <p className="help">{suggestion.kept}</p>}
        <div className="rewrite-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              onUse(suggestion.rewrite);
              setSuggestion(null);
            }}
          >
            Use this — I&rsquo;ll edit it
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => setSuggestion(null)}
          >
            No thanks
          </button>
        </div>
      </div>
    );
  }

  return (
    <p className="rewrite-ask">
      <button
        type="button"
        className="link-button"
        onClick={() => void ask()}
        disabled={asking}
      >
        {asking ? "Writing one…" : "Suggest a rewrite →"}
      </button>
      {nothing && (
        <span className="help">
          {" "}
          Nothing worth suggesting just now — what you wrote stands.
        </span>
      )}
    </p>
  );
}
