"use client";

import * as React from "react";
import { WhyAsked } from "../why-asked";
import { AlsoRequiredBy } from "../also-required-by";
import type { Obligation } from "@/lib/crosswalk";
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
import { STATE_LABEL, type RegisterRow } from "@/lib/control-register";

/**
 * The half of the controls screen that answers one control (G-87).
 *
 * Split from the register it sits beside because they are different jobs and
 * one file for both was over the budget (NFR-6): the register says what the
 * whole set looks like, this says everything about one of them.
 */
/**
 * One control, opened.
 *
 * Every row opens, including the ones nobody can answer here, because "why is
 * this on my list and why can I not act on it" is a question the screen should
 * answer rather than leave to a guess (§24.5, §24.8). What differs by state is
 * only what follows the reasons: a question and four answers where there is
 * one, the provenance where a platform gave it, and a plain statement of where
 * the pilot stops where it stops.
 */
export function Detail({
  row,
  objective,
  given,
  lookup,
  flagged,
  reasons,
  obligations,
  projectId,
  set,
  onClose,
}: {
  row: RegisterRow;
  objective: Tier3Objective | null;
  given: Record<string, Tier3Value>;
  lookup: AnswerLookup;
  flagged: boolean;
  reasons: string[];
  obligations: Obligation[];
  projectId: string;
  set: (questionId: string, next: Partial<Tier3Value>) => void;
  onClose: () => void;
}) {
  const value = objective ? given[objective.questionId] : undefined;
  const children = objective
    ? childrenAsked(objective, value?.answer ?? null, lookup)
    : [];

  return (
    <div className="drawer" data-state={row.state}>
      <div className="drawer-head">
        <p className="drawer-family">{row.familyName}</p>
        <h3>{row.name}</h3>
        <button type="button" className="drawer-close" onClick={onClose}>
          Close<span className="sr-only"> {row.name}</span>
        </button>
      </div>

      <p className="drawer-state">
        <span className="register-state" data-state={row.state}>
          {STATE_LABEL[row.state]}
        </span>
        {row.provider && (
          <span className="drawer-provenance">
            {row.state === "lapsed"
              ? `${row.provider.name} provided this, but its attestation ran out — it is yours to answer again.`
              : `Provided by ${row.provider.name}. ${row.provider.owner} attested to it on ${row.provider.attestedOn}.`}
          </span>
        )}
      </p>

      {reasons.length > 0 && (
        <p className="prefill" role="note">
          <span className="prefill-tag">Why you are asked</span>
          <span>{reasons.join("; and ")}</span>
        </p>
      )}

      {objective === null ? (
        /* Where the pilot stops, it says so (FR-35's rule, one tier down).
           This control is required and a reviewer will see it; there is
           simply no question for it yet, and silence would read as
           "nothing to do". */
        <div className="drawer-stops">
          <p>
            <strong>The pilot has no question for this one yet.</strong> It is
            recorded as required and goes to a reviewer as it stands, with the
            reason above. Nothing is missing from your side.
          </p>
        </div>
      ) : (
        <>
          <p className="gate-question">{objective.text}</p>
          <WhyAsked questionId={objective.questionId} />
          <AlsoRequiredBy obligations={obligations} />
          <p className="help gate-help">
            What this control is for:{" "}
            {objective.objective.replace(/^Ensure /, "")}
          </p>

          {row.state === "inherited" && (
            <p className="help">
              This answer came from the platform you said this runs on. Change
              it if that is not true for this activity — your answer replaces
              the platform&rsquo;s.
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
              <p role="note">
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

          <p className="drawer-handoff">
            <a href={`/projects/${projectId}/assess/objectives?focus=${objective.questionId}`}>
              Hand this question to another team &rarr;
            </a>
          </p>
        </>
      )}
    </div>
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
            aria-describedby={
              flagged && problem ? `note-problem-${questionId}` : undefined
            }
          />
          {flagged && problem && (
            <p id={`note-problem-${questionId}`} role="note">
              {problem}
            </p>
          )}
        </div>
      )}
    </>
  );
}
