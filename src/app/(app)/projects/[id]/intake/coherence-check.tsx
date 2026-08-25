"use client";

import * as React from "react";
import {
  checkIntake,
  suggestRewrite,
  type Suggestion,
} from "@/app/agent-actions";
import { applyIntakeFix } from "@/app/actions";
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
  onFixed,
}: {
  projectId: string;
  /** Puts a suggestion into the field, for them to edit. Never saves it. */
  onRewrite?: (fieldId: string, text: string) => void;
  /** Called after a correction lands, so the screen can catch up. */
  onFixed?: () => void;
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
            onFixed={onFixed}
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
  onFixed,
}: {
  result: Coherence;
  projectId: string;
  rewritable: string[];
  onRewrite?: (fieldId: string, text: string) => void;
  onFixed?: () => void;
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
          <div
            className="coherence-meter"
            role="img"
            aria-label={`${result.score} out of ${result.outOf}`}
          >
            <span
              className="coherence-meter-fill"
              style={{
                width: `${Math.round((result.score / result.outOf) * 100)}%`,
              }}
            />
          </div>
          <p className="coherence-meaning">{result.meaning}</p>
        </div>
      )}

      {result.opening && <p className="coherence-opening">{result.opening}</p>}

      {/* The narrative comes before the grades: it is the part they can
          check, and a wrong one tells them more than any score. */}
      {result.summary && (
        <div className="coherence-read">
          {result.summary.narrative.map((para, at) => (
            <p key={at}>{para}</p>
          ))}
        </div>
      )}

      {result.conflicts.length > 0 && (
        <div className="coherence-conflicts">
          <p className="coherence-conflicts-heading">
            What disagrees
            <span className="coherence-conflicts-count">
              {result.conflicts.length}
            </span>
          </p>
          {result.conflicts.map((clash, at) => (
            <div className="coherence-conflict" key={at}>
              <div className="coherence-halves">
                <blockquote className="coherence-quote">{clash.one}</blockquote>
                <p className="coherence-versus">
                  <span>against</span>
                </p>
                <blockquote className="coherence-quote">{clash.two}</blockquote>
              </div>
              {clash.why && (
                <p className="coherence-conflict-why">{clash.why}</p>
              )}
              {clash.fix && onFixed && (
                <FixButton
                  projectId={projectId}
                  fix={clash.fix}
                  onDone={onFixed}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {result.asks.length === 0 ? (
        <p className="coherence-clear">
          <span aria-hidden="true">✓</span> Nothing outstanding — a reviewer can
          work from this as written.
        </p>
      ) : (
        <details className="coherence-grades">
          <summary>
            How it graded
            <span className="coherence-grades-hint">
              {result.asks.length} of {result.outOf / 4} criteria below full
              marks
            </span>
          </summary>
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
                  <LevelDots level={ask.level} />
                  {ask.routing && (
                    <span className="coherence-routing">decides routing</span>
                  )}
                </p>
                <p className="coherence-ask-body">{ask.note ?? ask.sentence}</p>
                {ask.unquoted && (
                  <p className="coherence-ask-body">{ask.unquoted}</p>
                )}
                {ask.anchor && (
                  <p className="coherence-anchor">
                    <span className="coherence-anchor-label">Full marks</span>
                    {ask.anchor}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
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
/**
 * A level as four dots, filled to the grade. The same idiom the sensitivity
 * options use, so a reader who has met one has met both — and never colour
 * alone: the reading stays in text for anything that speaks the page.
 */
function LevelDots({ level }: { level: number }) {
  return (
    <span className="coherence-level" title={`${level} of 4`}>
      <span className="coherence-dots" aria-hidden="true">
        {[1, 2, 3, 4].map((at) => (
          <span
            key={at}
            className={at <= level ? "coherence-dot on" : "coherence-dot"}
          />
        ))}
      </span>
      <span className="coherence-level-text">{level} of 4</span>
    </span>
  );
}

/**
 * One proposed correction, applied only when somebody chooses it.
 *
 * The value was checked against the instrument's own options twice — in the
 * agent and again in the action — so what this writes is an answer the form
 * already allowed. It is still theirs: it sits beside both halves of the
 * contradiction, and it changes nothing until clicked.
 */
function FixButton({
  projectId,
  fix,
  onDone,
}: {
  projectId: string;
  fix: { field: string; label: string; value: string };
  onDone: () => void;
}) {
  const [state, setState] = React.useState<
    "idle" | "saving" | "done" | "failed"
  >("idle");

  if (state === "done") {
    return (
      <p className="coherence-fixed">
        <span aria-hidden="true">✓</span> Set to &ldquo;{fix.value}&rdquo;. You
        can change it back on {fix.label.replace(/\?$/, "")}.
      </p>
    );
  }

  return (
    <p className="coherence-fix">
      <button
        type="button"
        className="btn btn-small"
        disabled={state === "saving"}
        onClick={async () => {
          setState("saving");
          try {
            const outcome = await applyIntakeFix(
              projectId,
              fix.field,
              fix.value,
            );
            if (isFailure(outcome)) {
              setState("failed");
              return;
            }
            setState("done");
            onDone();
          } catch (cause) {
            console.error("applyIntakeFix", cause);
            setState("failed");
          }
        }}
      >
        {state === "saving"
          ? "Changing…"
          : // Naming the field, because this writes to the record and two
            // corrections sitting together both reading "change to Yes"
            // would leave a person guessing which answer they just moved.
            `Change “${fix.label.replace(/\?$/, "")}” to “${fix.value}”`}
      </button>
      {state === "failed" && (
        <span className="help">
          That didn&rsquo;t save — the answer is unchanged, and you can set it
          on its own section.
        </span>
      )}
    </p>
  );
}

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
  const [nothing, setNothing] = React.useState<
    null | "refused" | "unavailable"
  >(null);

  async function ask() {
    if (asking) return;
    setAsking(true);
    setNothing(null);
    try {
      const outcome = await suggestRewrite(projectId, fieldId, shortfalls);
      if (isFailure(outcome)) {
        setNothing("unavailable");
        return;
      }
      setSuggestion(outcome.suggestion);
      // Only say their writing stands when something actually read it.
      setNothing(outcome.suggestion ? null : (outcome.why ?? "unavailable"));
    } catch (cause) {
      console.error("suggestRewrite transport", cause);
      setNothing("unavailable");
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
      {nothing === "refused" && (
        <span className="help">
          {" "}
          Nothing worth suggesting — what you wrote stands.
        </span>
      )}
      {nothing === "unavailable" && (
        <span className="help">
          {" "}
          I couldn&rsquo;t write one just then — that is about me, not your
          writing. Worth trying again.
        </span>
      )}
    </p>
  );
}
