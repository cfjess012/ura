"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { answerObjectives } from "@/app/actions";
import { isFailure } from "@/lib/errors";
import { SaveBar, useAutosave } from "../autosave";
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
  const [flagged, setFlagged] = React.useState(false);
  // Every other assess screen autosaves. This one did not, so an answer
  // given here vanished on navigation with nothing said — exactly the
  // silent discard G-40a exists to forbid: an answer is saved when it is
  // given, not when a form is submitted (verifier S6-4).
  const autosave = useAutosave({
    where: "answerObjectives",
    transportMessage:
      "The server couldn't be reached, so nothing was saved. What you wrote is still on screen — try again in a moment.",
  });

  const set = (questionId: string, next: Partial<Tier3Value>) => {
    autosave.touched.current.add(questionId);
    setGiven((prev) => {
      const merged: Record<string, Tier3Value> = {
        ...prev,
        [questionId]: {
          answer: next.answer ?? prev[questionId]?.answer ?? "Yes",
          note: next.note ?? prev[questionId]?.note ?? "",
        },
      };
      // An answer needing a note is not saved until it has one: writing it
      // half-formed would record a No with no explanation, which is the
      // thing §3.4 forbids. The note's own keystrokes then save it.
      const value = merged[questionId]!;
      if (noteProblem(value.answer, value.note) === null) {
        // Revert on refusal: the children a Yes reveals, and the note field
        // a No opens, are consequences of an answer that may not have been
        // recorded (B5).
        autosave.save(
          () => write(merged),
          () => setGiven(prev),
        );
      }
      return merged;
    });
  };

  /** Only what this person touched, and only what is on screen (G-42). */
  async function write(current: Record<string, Tier3Value>) {
    const visible = new Set(
      objectives.flatMap((objective) => [
        objective.questionId,
        ...childrenAsked(objective, current[objective.questionId]?.answer ?? null, lookup).map(
          (c) => c.questionId,
        ),
      ]),
    );
    const payload = Object.fromEntries(
      Object.entries(current).filter(
        ([id]) => visible.has(id) && autosave.touched.current.has(id),
      ),
    );
    if (Object.keys(payload).length === 0) return null;
    return answerObjectives(projectId, payload);
  }

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

  /** Forward is a confirmation, not the moment of saving. */
  const saveAndGo = () => autosave.submit(() => write(given), nextHref);

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
        await saveAndGo();
      }}
    >
      {objectives.map((objective) => {
        const value = given[objective.questionId];
        const children = childrenAsked(objective, value?.answer ?? null, lookup);
        return (
          <div className="card q3" key={objective.id} data-focus={objective.questionId}>
            <p className="q3-name">{objective.name}</p>
            <p className="gate-question">{objective.text}</p>
            <p className="help gate-help">
              What this control is for: {objective.objective.replace(/^Ensure /, "")}
            </p>
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

      <SaveBar
        state={autosave}
        submitLabel="Save and see where this stands →"
        blocked={flagged && missingNotes.length > 0}
        status={
          missingNotes.length === 0
            ? `${answered} of ${onScreen.length} answered.`
            : flagged
              ? `Write the ${missingNotes.length === 1 ? "note" : `${missingNotes.length} notes`} above — a reviewer reads them instead of the answer.`
              : `${answered} of ${onScreen.length} answered · ${missingNotes.length} still ${missingNotes.length === 1 ? "needs" : "need"} a note`
        }
      />
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
