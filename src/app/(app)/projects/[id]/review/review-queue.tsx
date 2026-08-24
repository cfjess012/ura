"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { attestAnswer } from "@/app/actions";
import { errorRef, isFailure } from "@/lib/errors";
import { REVIEW_BAND_LABEL, type ReviewBand, type ReviewCriterion } from "@/lib/grounding";
import { TIER3_ANSWERS, type Tier3Answer } from "@/lib/tier3";

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
  findings: { id: string; kind: string; note: string; open: boolean }[];
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
}: {
  projectId: string;
  items: QueueItem[];
  canAttest: boolean;
}) {
  const router = useRouter();
  const [at, setAt] = React.useState(0);
  const [act, setAct] = React.useState<"approve" | "correct" | "not-applicable">("approve");
  const [corrected, setCorrected] = React.useState<Tier3Answer>("No");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; ref?: string } | null>(null);
  const current = items[at];

  const move = React.useCallback(
    (by: number) => {
      setAt((was) => Math.min(items.length - 1, Math.max(0, was + by)));
      setAct("approve");
      setNote("");
      setError(null);
    },
    [items.length],
  );

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      // Never steal a keystroke from someone typing their reason.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const keys: Record<string, () => void> = {
        j: () => move(1),
        k: () => move(-1),
        a: () => setAct("approve"),
        c: () => setAct("correct"),
        n: () => setAct("not-applicable"),
      };
      const handler = keys[event.key.toLowerCase()];
      if (handler) {
        event.preventDefault();
        handler();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  async function sign() {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const result = await attestAnswer(projectId, {
        questionId: current.questionId,
        objective: current.objective,
        act,
        correctedAnswer: act === "correct" ? corrected : null,
        note,
      });
      if (isFailure(result)) {
        setError({ message: result.message, ref: result.ref });
        return;
      }
      setNote("");
      setAct("approve");
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
        <p className="rail-title">To attest</p>
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
                  setNote("");
                }}
              >
                <span className="rail-name">{item.name}</span>
                <span className="rail-state">
                  {item.attestation
                    ? actLabel(item.attestation.act)
                    : item.mine
                      ? (item.band && REVIEW_BAND_LABEL[item.band]) || "Unanswered"
                      : "Another area's"}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="rail-back">
          <span className="rail-back-link">j / k to move · a approve · c correct · n N-A</span>
        </p>
      </nav>

      <section>
        {!current ? (
          <div className="card">
            <h2>Nothing to review</h2>
            <p className="help">
              This assessment required no controls the pilot asks about, so there is
              nothing here to sign.
            </p>
          </div>
        ) : (
          <>
            <div className="card q3">
              <p className="q3-name">{current.name}</p>
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
                      <span className={`band-tag band-${finding.kind === "gap" ? "high" : "medium"}`}>
                        {finding.kind === "gap" ? "Gap" : "Enhancement"}
                      </span>{" "}
                      {finding.note}
                      {!finding.open && <span className="meta"> — settled</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {current.attestation ? (
              <div className="card">
                <h2>Already signed</h2>
                <p className="help">
                  {actLabel(current.attestation.act)} by {current.attestation.by} on{" "}
                  {new Date(current.attestation.at).toLocaleDateString()}
                  {current.attestation.note ? ` — “${current.attestation.note}”` : ""}
                </p>
                <p className="help">
                  An attested answer is corrected by attesting again, never by erasing
                  this one.
                </p>
              </div>
            ) : !canAttest ? (
              <div className="card card-upcoming">
                <h2>Reading, not signing</h2>
                <p>Attesting is a Risk Assessor&rsquo;s act. You can see everything here.</p>
              </div>
            ) : !current.mine ? (
              <div className="card">
                <h2>Another area&rsquo;s to sign</h2>
                <p className="help">
                  This control belongs to a different risk area. You can read it; the
                  assessor who owns it signs it.
                </p>
              </div>
            ) : (
              <div className="card declare">
                <h2>Your attestation</h2>
                <div className="q3-answers" role="radiogroup" aria-label="How are you attesting?">
                  {(["approve", "correct", "not-applicable"] as const).map((option) => (
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
                      onChange={(event) => setCorrected(event.target.value as Tier3Answer)}
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
                      rows={2}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </div>
                )}

                <div className="savebar" style={{ marginTop: "0.8rem" }}>
                  <span role="status" aria-live="polite" className={error ? "save-failed" : "saved"}>
                    {busy ? (
                      "Signing…"
                    ) : error ? (
                      <>
                        {error.message}{" "}
                        {error.ref && <span className="err-ref">Reference {error.ref}</span>}
                      </>
                    ) : (
                      ""
                    )}
                  </span>
                  <button type="button" className="btn" disabled={busy} onClick={() => void sign()}>
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
  return act === "approve" ? "Approve" : act === "correct" ? "Correct" : "Not applicable";
}

/**
 * The band, as bars and a count and a sentence — never a number alone.
 *
 * The shape is the prior platform's (G-61), including the line that does
 * the real work: these are mechanical checks, not model confidence. It is
 * on screen because a reviewer who mistakes it for a machine's opinion
 * would treat a "routine" as permission to skip, and it is not.
 */
function BandStrip({ band, criteria }: { band: ReviewBand; criteria: ReviewCriterion[] }) {
  const [open, setOpen] = React.useState(false);
  const passed = criteria.filter((c) => c.pass === true).length;
  return (
    <div className={`band-strip band-strip-${band}`}>
      <button type="button" className="band-summary" onClick={() => setOpen((was) => !was)}>
        <span
          className="band-bars"
          role="img"
          aria-label={`${REVIEW_BAND_LABEL[band]}: ${passed} of ${criteria.length} checks passed`}
        >
          {criteria.map((criterion, i) => (
            <span key={criterion.id} className={`band-bar${i < passed ? " on" : ""}`} />
          ))}
        </span>
        <strong>{REVIEW_BAND_LABEL[band]}</strong>
        <span className="band-count">
          {passed}/{criteria.length}
        </span>
        <span className="band-toggle">{open ? "Hide the checks" : "What is this?"}</span>
      </button>
      {open && (
        <ul className="band-receipts">
          <li className="band-receipts-head">
            Mechanical checks over what is on record — not model confidence, and never a
            reason to skip a signature.
          </li>
          {criteria.map((criterion) => (
            <li key={criterion.id}>
              <span aria-hidden="true" className={`band-mark mark-${String(criterion.pass)}`}>
                {criterion.pass === true ? "✓" : criterion.pass === false ? "✗" : "—"}
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
