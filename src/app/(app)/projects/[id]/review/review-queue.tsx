"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { attestAnswer } from "@/app/review-actions";
import { errorRef, isFailure } from "@/lib/errors";
import {
  REVIEW_BAND_LABEL,
  type ReviewBand,
  type ReviewCriterion,
} from "@/lib/grounding";
import { TIER3_ANSWERS, type Tier3Answer } from "@/lib/tier3";
import { ProgressMeter } from "@/app/(app)/progress-meter";
import { type Acceptor, SettleFinding } from "./settle-finding";
import { WhatChanged } from "./what-changed";

export type QueueItem = {
  questionId: string;
  objective: string;
  name: string;
  question: string;
  answer: Tier3Answer | null;
  note: string;
  domain: string | null;
  /** Whether this is in the signed-in assessor's risk area (FR-17). */
  mine: boolean;
  band: ReviewBand | null;
  criteria: ReviewCriterion[];
  attestation: {
    act: string;
    by: string;
    at: string;
    note: string;
    correctedAnswer: string | null;
  } | null;
  findings: {
    id: string;
    kind: string;
    note: string;
    open: boolean;
    /** How it was settled, in words — null while it is still open. */
    settlement: string | null;
    /** The reason the person gave for settling it that way. */
    settlementNote: string;
    /** On a non-compliance: the clause it breaches, to show beside it. */
    citation: {
      policyRef: string;
      clauseId: string;
      clauseText: string;
      expected: string;
    } | null;
    /** Why an expired acceptance put it back, when that is what happened. */
    reopened: string | null;
  }[];
};

/**
 * The reviewer's queue and what they are signing (S8, NFR-10).
 *
 * Keyboard-first, the way the prior platform's workspace was: j and k move,
 * a approves, c corrects, n marks not-applicable. A reviewer works through
 * a hundred of these; reaching for a mouse each time is the difference
 * between a tool and a chore.
 */
export function ReviewQueue({
  projectId,
  items,
  canAttest,
  acceptors,
  directory,
}: {
  projectId: string;
  items: QueueItem[];
  canAttest: boolean;
  /** Everyone who could accept a risk — never the person signed in (§4.3). */
  acceptors: Acceptor[];
  /** Everyone who could own a fix. FR-29: a person is chosen, not typed. */
  directory: Acceptor[];
}) {
  const router = useRouter();
  const [at, setAt] = React.useState(0);
  const [act, setAct] = React.useState<
    "approve" | "correct" | "not-applicable"
  >("approve");
  const [corrected, setCorrected] = React.useState<Tier3Answer>("No");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  /** Re-signing an answer that already carries a signature (§4.2). */
  const [reattesting, setReattesting] = React.useState(false);
  const [error, setError] = React.useState<{
    message: string;
    ref?: string;
  } | null>(null);
  const current = items[at];
  // Moving the queue must move focus with it, or a keyboard user hears
  // nothing and tabs from the top of the document to reach the next
  // control. §4.2 names focus management as part of this requirement.
  const panelRef = React.useRef<HTMLParagraphElement>(null);
  const noteRef = React.useRef<HTMLTextAreaElement>(null);
  const moved = React.useRef(false);

  React.useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    panelRef.current?.focus();
  }, [at]);

  const move = React.useCallback(
    (by: number) => {
      moved.current = true;
      setAt((was) => Math.min(items.length - 1, Math.max(0, was + by)));
      setAct("approve");
      setNote("");
      setError(null);
      setReattesting(false);
    },
    [items.length],
  );

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      // Never steal a keystroke from someone typing their reason.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // a signs. c and n choose the act that needs a reason and put the
      // cursor in the box for it. A key that only pre-selects, while the
      // legend says "a approve", is a control that needs a second press —
      // which reads as broken (§24.3).
      const signable = Boolean(current && current.mine && canAttest);
      const keys: Record<string, () => void> = {
        j: () => move(1),
        k: () => move(-1),
        a: () => {
          if (!signable) return;
          setAct("approve");
          void sign("approve");
        },
        c: () => {
          if (!signable) return;
          setAct("correct");
          window.setTimeout(() => noteRef.current?.focus(), 0);
        },
        n: () => {
          if (!signable) return;
          setAct("not-applicable");
          window.setTimeout(() => noteRef.current?.focus(), 0);
        },
      };
      const handler = keys[event.key.toLowerCase()];
      if (handler) {
        event.preventDefault();
        handler();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [move, current, canAttest, act, note, corrected]);

  async function sign(actNow: "approve" | "correct" | "not-applicable" = act) {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const result = await attestAnswer(projectId, {
        questionId: current.questionId,
        act: actNow,
        correctedAnswer: actNow === "correct" ? corrected : null,
        note,
      });
      if (isFailure(result)) {
        setError({ message: result.message, ref: result.ref });
        return;
      }
      setNote("");
      setAct("approve");
      setReattesting(false);
      router.refresh();
    } catch (cause) {
      console.error("attestAnswer transport", cause);
      setError({
        message:
          "The server couldn't be reached, so nothing was signed. What you wrote is still here.",
        ref: errorRef(),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="review-layout">
      <nav className="rail review-rail" aria-label="Controls to review">
        <p className="rail-title">{canAttest ? "To attest" : "Controls"}</p>
        {/* How much is left, without counting the rail by eye. */}
        <div style={{ margin: "0 0 0.7rem" }}>
          <ProgressMeter
            done={items.filter((item) => item.attestation).length}
            total={items.length}
            label="signed"
          />
        </div>
        <ol>
          {items.map((item, i) => (
            <li key={item.questionId}>
              <button
                type="button"
                className={`rail-item review-item${i === at ? " current" : ""}${
                  item.attestation ? " settled" : ""
                }`}
                aria-current={i === at ? "step" : undefined}
                onClick={() => {
                  setAt(i);
                  setAct("approve");
                  setReattesting(false);
                  setNote("");
                }}
              >
                <span className="rail-name">{item.name}</span>
                <span className="rail-state">
                  {item.attestation
                    ? actLabel(item.attestation.act)
                    : // "Another area's" means nothing to somebody with no
                      // area — a requester reading their own assessment
                      // (§24.7).
                      !canAttest
                      ? (item.band && REVIEW_BAND_LABEL[item.band]) ||
                        "Not signed yet"
                      : item.mine
                        ? (item.band && REVIEW_BAND_LABEL[item.band]) ||
                          "Unanswered"
                        : "Another area's"}
                </span>
              </button>
            </li>
          ))}
        </ol>
        {/* The legend names acts a reader cannot perform, so only show it
            to somebody who can perform them. */}
        {canAttest && (
          <p className="rail-back">
            <span className="rail-back-link">
              j / k to move · a signs · c correct · n N-A
            </span>
          </p>
        )}
      </nav>

      {/* Where you are, for anyone who is not watching the rail. */}
      <p className="sr-only" role="status" aria-live="polite">
        {current
          ? `${at + 1} of ${items.length}: ${current.name}`
          : "Nothing to review"}
      </p>

      <section>
        {!current ? (
          <div className="card">
            <h2>Nothing to review</h2>
            <p className="help">
              This assessment required no controls the pilot asks about, so
              there is nothing here to sign.
            </p>
          </div>
        ) : (
          <>
            <div className="card q3">
              <p className="q3-name" tabIndex={-1} ref={panelRef}>
                {current.name}
              </p>
              <p className="gate-question">{current.question}</p>
              <p className="help">
                Answered <strong>{current.answer ?? "not at all"}</strong>
                {current.note ? ` — “${current.note}”` : ""}
              </p>

              {current.band && (
                <BandStrip band={current.band} criteria={current.criteria} />
              )}

              {current.findings.length > 0 && (
                <ul className="summary-list" style={{ marginTop: "0.7rem" }}>
                  {current.findings.map((finding) => (
                    <li key={finding.id}>
                      <span
                        className={`band-tag band-${
                          finding.kind === "enhancement" ? "medium" : "high"
                        }`}
                      >
                        {finding.kind === "gap"
                          ? "Gap"
                          : finding.kind === "enhancement"
                            ? "Enhancement"
                            : "Breaches policy"}
                      </span>{" "}
                      {finding.note}
                      {/* Both quotes side by side: what the clause requires,
                          and what the person actually wrote (§22.1). */}
                      {finding.citation && (
                        <div className="breach">
                          <p className="breach-head">
                            {finding.citation.clauseId} expects{" "}
                            <strong>{finding.citation.expected}</strong>
                          </p>
                          <blockquote className="breach-quote">
                            “{finding.citation.clauseText}”
                          </blockquote>
                          <p className="help">
                            {finding.citation.policyRef}. Settling this is a
                            judgement about the activity, not about the policy —
                            the clause stands either way.
                          </p>
                        </div>
                      )}
                      {finding.settlement && (
                        <span className="meta"> — {finding.settlement}</span>
                      )}
                      {finding.settlementNote && (
                        <p className="help">
                          &ldquo;{finding.settlementNote}&rdquo;
                        </p>
                      )}
                      {finding.reopened && (
                        <p className="field-error">{finding.reopened}</p>
                      )}
                      {finding.open && canAttest && current.mine && (
                        <SettleFinding
                          projectId={projectId}
                          findingId={finding.id}
                          acceptors={acceptors}
                          directory={directory}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {current.attestation && !reattesting ? (
              <div className="card">
                <h2>Already signed</h2>
                <p className="help">
                  {actLabel(current.attestation.act)} by{" "}
                  {current.attestation.by} on{" "}
                  {new Date(current.attestation.at).toLocaleDateString()}
                  {current.attestation.note
                    ? ` — “${current.attestation.note}”`
                    : ""}
                </p>
                {current.attestation.act === "correct" &&
                  current.attestation.correctedAnswer && (
                    <WhatChanged
                      before={`${current.answer ?? "not answered"}${current.note ? ` — ${current.note}` : ""}`}
                      after={`${current.attestation.correctedAnswer}${current.attestation.note ? ` — ${current.attestation.note}` : ""}`}
                    />
                  )}
                <p className="help">
                  An attested answer is corrected by attesting again, never by
                  erasing this one.
                </p>
                {canAttest && current.mine && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      // The only way §4.2 allows a signature to change. It
                      // had no control on screen, which made the sentence
                      // above a description of something nobody could do.
                      setAct("correct");
                      setNote("");
                      setError(null);
                      setReattesting(true);
                    }}
                  >
                    Correct it and sign again →
                  </button>
                )}
              </div>
            ) : !canAttest ? (
              <div className="card card-upcoming">
                <h2>Reading, not signing</h2>
                <p>
                  Attesting is a Risk Assessor&rsquo;s act. You can see
                  everything here.
                </p>
              </div>
            ) : !current.mine ? (
              <div className="card">
                <h2>Another area&rsquo;s to sign</h2>
                <p className="help">
                  This control belongs to a different risk area. You can read
                  it; the assessor who owns it signs it.
                </p>
              </div>
            ) : (
              <div className="card declare">
                <h2>
                  {reattesting
                    ? "Correct it and sign again"
                    : "Your attestation"}
                </h2>
                {reattesting && (
                  <p className="help">
                    This replaces your signature with a new one. The one it
                    replaces stays on the record — nothing is erased.
                  </p>
                )}
                <div
                  className="q3-answers"
                  role="radiogroup"
                  aria-label="How are you attesting?"
                >
                  {(reattesting
                    ? (["correct"] as const)
                    : (["approve", "correct", "not-applicable"] as const)
                  ).map((option) => (
                    <button
                      type="button"
                      key={option}
                      role="radio"
                      aria-checked={act === option}
                      className={`q3-answer${act === option ? " chosen" : ""}`}
                      onClick={() => setAct(option)}
                    >
                      {actLabel(option)}
                      {act === option && (
                        <span aria-hidden="true" className="tick">
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {act === "correct" && (
                  <div className="q3-note">
                    <label htmlFor="corrected">Correct it to</label>
                    <select
                      id="corrected"
                      value={corrected}
                      onChange={(event) =>
                        setCorrected(event.target.value as Tier3Answer)
                      }
                    >
                      {TIER3_ANSWERS.map((answer) => (
                        <option key={answer} value={answer}>
                          {answer}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {act !== "approve" && (
                  <div className="q3-note">
                    <label htmlFor="attest-note">
                      {act === "correct"
                        ? "Why are you correcting it?"
                        : "Why doesn't this control apply here?"}
                    </label>
                    <textarea
                      id="attest-note"
                      ref={noteRef}
                      rows={2}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </div>
                )}

                <div className="savebar" style={{ marginTop: "0.8rem" }}>
                  <span
                    role="status"
                    aria-live="polite"
                    className={error ? "save-failed" : "saved"}
                  >
                    {busy ? (
                      "Signing…"
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
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void sign()}
                  >
                    {busy ? "Signing…" : `${actLabel(act)} and continue →`}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function actLabel(act: string): string {
  return act === "approve"
    ? "Approve"
    : act === "correct"
      ? "Correct"
      : "Not applicable";
}

/**
 * The band, as bars and a count and a sentence — never a number alone.
 *
 * The shape is the prior platform's (G-61), including the line that does
 * the real work: these are mechanical checks, not model confidence. It is
 * on screen because a reviewer who mistakes it for a machine's opinion
 * would treat a "routine" as permission to skip, and it is not.
 */
function BandStrip({
  band,
  criteria,
}: {
  band: ReviewBand;
  criteria: ReviewCriterion[];
}) {
  const [open, setOpen] = React.useState(false);
  const passed = criteria.filter((c) => c.pass === true).length;
  return (
    <div className={`band-strip band-strip-${band}`}>
      <button
        type="button"
        className="band-summary"
        onClick={() => setOpen((was) => !was)}
      >
        <span
          className="band-bars"
          role="img"
          aria-label={`${REVIEW_BAND_LABEL[band]}: ${passed} of ${criteria.length} checks passed`}
        >
          {criteria.map((criterion, i) => (
            <span
              key={criterion.id}
              className={`band-bar${i < passed ? " on" : ""}`}
            />
          ))}
        </span>
        <strong>{REVIEW_BAND_LABEL[band]}</strong>
        <span className="band-count">
          {passed}/{criteria.length}
        </span>
        <span className="band-toggle">
          {open ? "Hide the checks" : "What is this?"}
        </span>
      </button>
      {open && (
        <ul className="band-receipts">
          <li className="band-receipts-head">
            Mechanical checks over what is on record — not model confidence, and
            never a reason to skip a signature.
          </li>
          {criteria.map((criterion) => (
            <li key={criterion.id}>
              <span
                aria-hidden="true"
                className={`band-mark mark-${String(criterion.pass)}`}
              >
                {criterion.pass === true
                  ? "✓"
                  : criterion.pass === false
                    ? "✗"
                    : "—"}
              </span>
              <span>
                <strong>{criterion.label}</strong> — {criterion.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
