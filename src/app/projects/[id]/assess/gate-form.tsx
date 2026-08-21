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
  because,
  nextHref,
}: {
  projectId: string;
  categoryKey: string;
  questionId: string;
  answer: "Yes" | "No" | null;
  fromIntake: boolean;
  because: string | null;
  nextHref: string;
}) {
  const router = useRouter();
  const [choice, setChoice] = React.useState<"Yes" | "No" | null>(answer);
  const [saving, setSaving] = React.useState<"Yes" | "No" | null>(null);
  const [error, setError] = React.useState<{
    message: string;
    ref: string;
  } | null>(null);

  async function choose(value: "Yes" | "No") {
    setChoice(value);
    setSaving(value);
    setError(null);
    try {
      const result = await answerGate(projectId, questionId, value);
      if (isFailure(result)) {
        setChoice(answer); // put it back: nothing was recorded
        setError({ message: result.message, ref: result.ref });
        return;
      }
      router.push(nextHref);
    } catch (cause) {
      console.error("answerGate transport", cause);
      setChoice(answer);
      setError({
        message:
          "Couldn't reach the server — nothing was recorded. Check your connection.",
        ref: "OFFLINE",
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="gate-answer">
      {fromIntake && because && (
        <p className="prefill" role="note">
          <span className="prefill-tag">Answered from your intake</span>
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
            disabled={saving !== null}
            onClick={() => void choose(value)}
            className={`gate-choice ${choice === value ? "chosen" : ""}`}
          >
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
          ""
        )}
      </p>
    </div>
  );
}
