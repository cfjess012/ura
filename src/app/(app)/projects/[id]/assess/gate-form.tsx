"use client";

/**
 * One gate, one screen (§24.2). Yes and No are equal-weight choices — a
 * gate is not a form to complete but a fact to state, and "No" is a
 * perfectly good answer that closes a whole risk area.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { answerGate } from "@/app/actions";
import { isFailure } from "@/lib/errors";

export function GateForm({
  projectId,
  categoryKey,
  questionId,
  answer,
  fromIntake,
  origin,
  because,
  nextHref,
}: {
  projectId: string;
  categoryKey: string;
  questionId: string;
  answer: "Yes" | "No" | null;
  fromIntake: boolean;
  origin: "intake" | "answers" | null;
  because: string | null;
  nextHref: string;
}) {
  const router = useRouter();
  const [choice, setChoice] = React.useState<"Yes" | "No" | null>(answer);
  const [saving, setSaving] = React.useState<"Yes" | "No" | null>(null);
  // What the status region says out loud. A save that only redraws the screen
  // is silent to a screen reader, so the outcome is stated (F12).
  const [announcement, setAnnouncement] = React.useState("");
  const [error, setError] = React.useState<{
    message: string;
    ref: string;
    /** False when trying again cannot possibly work (§25.4, N2). */
    retryable: boolean;
  } | null>(null);

  async function choose(value: "Yes" | "No") {
    setChoice(value);
    setSaving(value);
    setError(null);
    setAnnouncement("");
    try {
      const result = await answerGate(projectId, questionId, value);
      if (isFailure(result)) {
        setChoice(answer); // put it back: nothing was recorded
        setError({ message: result.message, ref: result.ref, retryable: result.retryable });
        return;
      }
      setAnnouncement(
        value === "Yes"
          ? "Recorded: yes, this area applies. Opening the next risk area."
          : "Recorded: no, this area does not apply. It will be skipped. Opening the next risk area.",
      );
      router.push(nextHref);
    } catch (cause) {
      console.error("answerGate transport", cause);
      setChoice(answer);
      setError({
        message:
          "The server couldn't be reached, so this answer wasn't recorded. Everything you answered before is safe. Try again in a moment.",
        ref: "OFFLINE",
        retryable: true,
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="gate-answer">
      {fromIntake && because && (
        <p className="prefill" role="note">
          {/* "From your intake" was a lie when the source was another gate:
              it attributed to the person a sentence they never said. The
              reason itself now names the real evidence either way. */}
          <span className="prefill-tag">
            {origin === "answers" ? "Answered from your answers" : "Answered from your intake"}
          </span>
          <span>
            We&rsquo;ve marked this <strong>{answer}</strong> because {because}.
            Change it if that&rsquo;s not right.
          </span>
        </p>
      )}

      <div
        className="gate-choices"
        role="group"
        aria-label="Does this risk area apply?"
      >
        {(["Yes", "No"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={choice === value}
            disabled={saving !== null || (error !== null && !error.retryable)}
            onClick={() => void choose(value)}
            className={`gate-choice ${choice === value ? "chosen" : ""}`}
          >
            {/* Selection must not read as focus (F14): the chosen card carries
                a mark and a weight of its own, so the two states never look
                like the same state. */}
            <span className="gate-choice-mark" aria-hidden="true">
              {choice === value ? "\u2713" : ""}
            </span>
            <span className="gate-choice-label">
              {saving === value
                ? "Saving…"
                : value === "Yes"
                  ? "Yes, it applies"
                  : "No, it doesn't"}
            </span>
            <span className="gate-choice-note">
              {value === "Yes"
                ? "We'll ask more about this area later"
                : "We'll skip this area entirely"}
            </span>
          </button>
        ))}
      </div>

      <p
        role="status"
        aria-live="polite"
        className={error ? "save-failed" : "gate-status"}
      >
        {error ? (
          <>
            {error.message}{" "}
            <span className="err-ref">Reference {error.ref}</span>
          </>
        ) : (
          announcement
        )}
      </p>
    </div>
  );
}
