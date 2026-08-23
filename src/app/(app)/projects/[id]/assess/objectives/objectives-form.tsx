"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { answerObjectives } from "@/app/actions";
import { errorRef, isFailure } from "@/lib/errors";
import {
  TIER3_ANSWERS,
  childrenAsked,
  noteProblem,
  noteRequired,
  type Tier3Answer,
  type Tier3Objective,
  type Tier3Value,
} from "@/lib/tier3";
import type { AnswerLookup } from "@/lib/conditions";

/**
 * Tier 3 in practice (FR-12, FR-13).
 *
 * One card per control objective: the question, the four answers, and — on
 * anything but Yes — the note that becomes the finding a reviewer reads.
 * Children reveal only on Yes, and only where their own cross-tier
 * conditions hold; a suppressed child renders nothing at all, never a
 * greyed placeholder (§3.4).
 */
export function ObjectivesForm({
  projectId,
  objectives,
  values,
  lookup,
  reasons,
  nextHref,
}: {
  projectId: string;
  objectives: Tier3Objective[];
  values: Record<string, Tier3Value>;
  lookup: AnswerLookup;
  /** Why each objective is here — carried through from accumulation. */
  reasons: Record<string, string[]>;
  nextHref: string;
}) {
  const router = useRouter();
  const [given, setGiven] = React.useState<Record<string, Tier3Value>>(values);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; ref?: string } | null>(null);
  const [flagged, setFlagged] = React.useState(false);

  const set = (questionId: string, next: Partial<Tier3Value>) =>
    setGiven((prev) => ({
      ...prev,
      [questionId]: {
        answer: next.answer ?? prev[questionId]?.answer ?? "Yes",
        note: next.note ?? prev[questionId]?.note ?? "",
      },
    }));

  /** Every question on screen right now, parents and revealed children. */
  const onScreen = objectives.flatMap((objective) => [
    { id: objective.questionId, label: objective.name },
    ...childrenAsked(objective, given[objective.questionId]?.answer ?? null, lookup).map((c) => ({
      id: c.questionId,
      label: c.text,
    })),
  ]);
  const missingNotes = onScreen.filter(({ id }) => {
    const value = given[id];
    return value ? noteProblem(value.answer, value.note) !== null : false;
  });
  const answered = onScreen.filter(({ id }) => given[id]).length;

  async function save(andGo: boolean) {
    setSaving(true);
    setError(null);
    try {
      // Only what is on screen: a child suppressed by its parent's answer is
      // not an answer this person gave (G-42).
      const visible = new Set(onScreen.map((q) => q.id));
      const payload = Object.fromEntries(
        Object.entries(given).filter(([id]) => visible.has(id)),
      );
      const result = await answerObjectives(projectId, payload);
      if (isFailure(result)) {
        setError({ message: result.message, ref: result.ref });
        return;
      }
      if (andGo) router.push(nextHref);
      else router.refresh();
    } catch (cause) {
      console.error("answerObjectives transport", cause);
      setError({
        message:
          "The server couldn't be reached, so nothing was saved. What you wrote is still here. Try again in a moment.",
        ref: errorRef(),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (missingNotes.length > 0) {
          setFlagged(true);
          document.getElementById(`note-${missingNotes[0]!.id}`)?.focus();
          return;
        }
        setFlagged(false);
        await save(true);
      }}
    >
      {objectives.map((objective) => {
        const value = given[objective.questionId];
        const children = childrenAsked(objective, value?.answer ?? null, lookup);
        return (
          <div className="card q3" key={objective.id} data-focus={objective.questionId}>
            <p className="q3-name">{objective.name}</p>
            <p className="gate-question">{objective.text}</p>
            {(reasons[objective.id] ?? []).length > 0 && (
              <p className="prefill" role="note">
                <span className="prefill-tag">Why you are asked</span>
                <span>{(reasons[objective.id] ?? []).join("; and ")}</span>
              </p>
            )}

            <Answers
              questionId={objective.questionId}
              label={objective.text}
              value={value}
              flagged={flagged}
              onAnswer={(answer) => set(objective.questionId, { answer })}
              onNote={(note) => set(objective.questionId, { note })}
            />

            {children.length > 0 && (
              <div className="q3-children">
                <p className="reveal-note" role="note">
                  Shown because the control exists — these ask what it covers.
                </p>
                {children.map((child) => (
                  <div className="q3-child" key={child.id}>
                    <p className="gate-question">{child.text}</p>
                    <Answers
                      questionId={child.questionId}
                      label={child.text}
                      value={given[child.questionId]}
                      flagged={flagged}
                      onAnswer={(answer) => set(child.questionId, { answer })}
                      onNote={(note) => set(child.questionId, { note })}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="savebar">
        <span className={flagged && missingNotes.length > 0 ? "missing blocked" : "missing"}>
          {missingNotes.length === 0
            ? `${answered} of ${onScreen.length} answered.`
            : flagged
              ? `Write the ${missingNotes.length === 1 ? "note" : `${missingNotes.length} notes`} above — a reviewer reads them instead of the answer.`
              : `${answered} of ${onScreen.length} answered · ${missingNotes.length} still need a note`}
        </span>
        <span style={{ display: "flex", gap: "0.8rem", alignItems: "center" }}>
          <span role="status" aria-live="polite" className={error ? "save-failed" : "saved"}>
            {saving ? (
              "Saving…"
            ) : error ? (
              <>
                {error.message}{" "}
                {error.ref && <span className="err-ref">Reference {error.ref}</span>}
              </>
            ) : (
              ""
            )}
          </span>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Saving…" : "Save and see where this stands →"}
          </button>
        </span>
      </div>
    </form>
  );
}

/** The four answers, and the note that anything but Yes has to carry. */
function Answers({
  questionId,
  label,
  value,
  flagged,
  onAnswer,
  onNote,
}: {
  questionId: string;
  /**
   * The question these answers belong to. Every group carried the same
   * name — "Does this control exist?" — so a screen reader announced a
   * child's four buttons as if they answered its parent (§23).
   */
  label: string;
  value: Tier3Value | undefined;
  flagged: boolean;
  onAnswer: (answer: Tier3Answer) => void;
  onNote: (note: string) => void;
}) {
  const problem = value ? noteProblem(value.answer, value.note) : null;
  return (
    <>
      <div className="q3-answers" role="radiogroup" aria-label={label}>
        {TIER3_ANSWERS.map((answer) => {
          const chosen = value?.answer === answer;
          return (
            <button
              type="button"
              key={answer}
              role="radio"
              aria-checked={chosen}
              className={`q3-answer${chosen ? " chosen" : ""} a-${answer.toLowerCase().replace(/[^a-z]/g, "")}`}
              onClick={() => onAnswer(answer)}
            >
              {answer}
              {chosen && (
                <span aria-hidden="true" className="tick">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {value && noteRequired(value.answer) && (
        <div className="q3-note">
          <label htmlFor={`note-${questionId}`}>
            {value.answer === "N-A"
              ? "Why doesn't this apply?"
              : "What exists today, and what is missing?"}
          </label>
          <textarea
            id={`note-${questionId}`}
            name={`note-${questionId}`}
            rows={2}
            value={value.note}
            onChange={(event) => onNote(event.target.value)}
            aria-invalid={flagged && problem !== null}
            aria-describedby={flagged && problem ? `note-problem-${questionId}` : undefined}
          />
          {flagged && problem && (
            <p className="field-problem" id={`note-problem-${questionId}`} role="note">
              {problem}
            </p>
          )}
        </div>
      )}
    </>
  );
}
