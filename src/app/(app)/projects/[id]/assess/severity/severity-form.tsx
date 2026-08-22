"use client";

/**
 * One category's severity questions (FR-6, FR-8).
 *
 * The rubric anchor IS the option: a person picks the sentence that
 * describes their situation, not a bare word. Two assessors reading
 * "privileged or admin access to production" reach the same answer; two
 * assessors reading "High" do not.
 */
import * as React from "react";
import { answerSeverity } from "@/app/actions";
import { assessmentLookup } from "@/lib/engine";
import { isFailure } from "@/lib/errors";
import {
  BANDS,
  accumulateControls,
  detailFires,
  writableSeverityAnswers,
  type Band,
  type DerivedBand,
  type SeverityQuestion,
} from "@/lib/severity";
import { SaveBar, useAutosave } from "../autosave";
import { HandoffPanel, type HandoffView, type Recipient } from "./handoff-panel";

export type SeverityItem = {
  question: SeverityQuestion;
  band: Band | null;
  detail: string[];
  /** A band worked out from a fact already given, not asked (FR-7). */
  derived: DerivedBand | null;
};

export function SeverityForm({
  projectId,
  items,
  nextHref,
  nextLabel,
  recipients,
  handoffs,
}: {
  projectId: string;
  items: SeverityItem[];
  nextHref: string;
  nextLabel: string;
  recipients: Recipient[];
  /** Hand-offs on this screen's questions, by question id (S4.7). */
  handoffs: Record<string, HandoffView>;
}) {
  const [bands, setBands] = React.useState<Record<string, Band | null>>(
    Object.fromEntries(items.map((i) => [i.question.questionId, i.band])),
  );
  const [details, setDetails] = React.useState<Record<string, string[]>>(
    Object.fromEntries(
      items.map((i) => [
        i.question.detail?.questionId ?? i.question.id,
        i.detail,
      ]),
    ),
  );
  const autosave = useAutosave({
    where: "answerSeverity",
    transportMessage:
      "The server couldn't be reached, so nothing was saved. Your answers are still on screen — try again in a moment.",
  });

  // What is on file. Seeded from what the server rendered and updated on
  // every successful write, so re-saving an unchanged answer is not recorded
  // as a second event.
  const persisted = React.useRef<Record<string, string | string[]>>(
    Object.fromEntries(
      items.flatMap((i) => [
        ...(i.band ? [[i.question.questionId, i.band] as const] : []),
        ...(i.question.detail
          ? [[i.question.detail.questionId, i.detail] as const]
          : []),
      ]),
    ),
  );

  // The rule lives in the pure module, where a test can prove it without a
  // browser (§26.1). It refuses to write a detail question that was never on
  // screen: an empty list here is the substantive answer "none of these
  // apply", permanent, insert-only and attributed.
  async function write(
    nextBands: Record<string, Band | null>,
    nextDetails: Record<string, string[]>,
    only: string[],
  ) {
    const payload = writableSeverityAnswers(
      items.map((i) => i.question),
      nextBands,
      nextDetails,
      only,
      persisted.current,
    );
    if (Object.keys(payload).length === 0) return null;
    const result = await answerSeverity(projectId, payload);
    if (!isFailure(result))
      persisted.current = { ...persisted.current, ...payload };
    return result;
  }

  function choose(question: SeverityQuestion, band: Band) {
    const next = { ...bands, [question.questionId]: band };
    setBands(next);
    autosave.touched.current.add(question.questionId);
    autosave.save(() => write(next, details, [...autosave.touched.current]));
  }

  function toggleDetail(
    question: SeverityQuestion,
    option: string,
    on: boolean,
  ) {
    const key = question.detail!.questionId;
    const current = details[key] ?? [];
    const next = {
      ...details,
      [key]: on ? [...current, option] : current.filter((o) => o !== option),
    };
    setDetails(next);
    autosave.touched.current.add(key);
    autosave.save(() => write(bands, next, [...autosave.touched.current]));
  }

  // Recomputed on every render from what is on screen, never stored.
  const answers = assessmentLookup({ severities: bands });
  const owed = accumulateControls(
    items.map((i) => i.question),
    bands as Record<string, Band | undefined>,
    details,
  );
  const answered = items.filter((i) => bands[i.question.questionId]).length;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        // Submitting covers the whole screen, touched or not (G-42).
        const everything = items.flatMap((i) =>
          [i.question.questionId, i.question.detail?.questionId].filter(
            Boolean,
          ),
        ) as string[];
        void autosave.submit(() => write(bands, details, everything), nextHref);
      }}
    >
      {items.map(({ question, derived }) => {
        const band = bands[question.questionId];
        const showsDetail = detailFires(question, answers);
        return (
          <section key={question.id} className="card q2" data-focus={question.questionId}>
            <h3 className="q2-name">{question.name}</h3>
            <p className="gate-question" id={`${question.questionId}-label`}>
              {question.text}
            </p>

            {derived && !band && (
              <p className="prefill" role="note">
                <span className="prefill-tag">Worked out for you</span>
                <span>
                  This looks like <strong>{derived.band}</strong> because{" "}
                  {derived.because}. Pick a different one if that&rsquo;s not
                  right.
                </span>
              </p>
            )}

            {/*
              A radio group has a keyboard contract, and declaring the role
              without honouring it is worse than not declaring it: a screen
              reader announces "radio group, 1 of 3", the person presses an
              arrow, nothing moves, and they conclude the control is broken.
              Roving tabindex (one stop per group, not three — up to 78 on a
              full instrument) plus arrow/Home/End, per WAI-ARIA.
            */}
            <div
              className="bands"
              role="radiogroup"
              aria-labelledby={`${question.questionId}-label`}
              onKeyDown={(event) => {
                const keys = [
                  "ArrowRight",
                  "ArrowDown",
                  "ArrowLeft",
                  "ArrowUp",
                  "Home",
                  "End",
                ];
                if (!keys.includes(event.key)) return;
                event.preventDefault();
                const at = band ? BANDS.indexOf(band) : 0;
                const to =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? BANDS.length - 1
                      : event.key === "ArrowRight" || event.key === "ArrowDown"
                        ? (at + 1) % BANDS.length
                        : (at - 1 + BANDS.length) % BANDS.length;
                choose(question, BANDS[to]!);
                const group = event.currentTarget;
                group
                  .querySelectorAll<HTMLButtonElement>("button")
                  [to]?.focus();
              }}
            >
              {BANDS.map((option, optionIndex) => {
                const chosen = band === option;
                const suggested = !band && derived?.band === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    // One tab stop for the group: the chosen option, or the
                    // first when nothing is chosen yet.
                    tabIndex={(band ? chosen : optionIndex === 0) ? 0 : -1}
                    className={`band${chosen ? " chosen" : ""}${suggested ? " suggested" : ""}`}
                    onClick={() => choose(question, option)}
                  >
                    <span className="band-mark" aria-hidden="true">
                      {chosen ? "✓" : ""}
                    </span>
                    <span className="band-level">{option}</span>
                    <span className="band-anchor">
                      {question.bands[option]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/*
              The way out for a question a person genuinely cannot answer.
              It is not an answer and is never recorded as one — the record
              says the question moved to someone else (S4.7).
            */}
            <HandoffPanel
              projectId={projectId}
              questionId={question.questionId}
              recipients={recipients}
              existing={handoffs[question.questionId] ?? null}
            />

            {showsDetail && (
              <div className="detail reveal">
                <p className="why">
                  <span aria-hidden="true">↳</span> Shown because you answered{" "}
                  {band}.
                </p>
                <p
                  className="field"
                  id={`${question.detail!.questionId}-label`}
                >
                  {question.detail!.text}
                </p>
                <div
                  className="checks pathopts"
                  role="group"
                  aria-labelledby={`${question.detail!.questionId}-label`}
                >
                  {question.detail!.options.map((option) => (
                    <label key={option} className="pathopt">
                      <input
                        type="checkbox"
                        name={question.detail!.questionId}
                        value={option}
                        checked={(
                          details[question.detail!.questionId] ?? []
                        ).includes(option)}
                        onChange={(e) =>
                          toggleDetail(question, option, e.target.checked)
                        }
                      />
                      <span className="pathopt-label">{option}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}

      {owed.length > 0 && (
        <div className="card owed">
          <h2>What these answers require</h2>
          <p className="help">
            Assembled from your answers as you give them. Each one names why it
            is here; the questions themselves come later.
          </p>
          <ul className="summary-list">
            {owed.map((control) => (
              <li key={control.objective}>
                <strong>{control.name}</strong>
                <span className="meta">
                  {" "}
                  — {control.because.join("; and ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SaveBar
        state={autosave}
        submitLabel={nextLabel}
        status={
          <>
            {answered} of {items.length} answered
            {owed.length > 0
              ? ` · ${owed.length} control${owed.length === 1 ? "" : "s"} required so far`
              : ""}
          </>
        }
      />
    </form>
  );
}
