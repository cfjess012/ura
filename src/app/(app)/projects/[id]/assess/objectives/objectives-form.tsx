"use client";

import * as React from "react";
import type { Obligation } from "@/lib/crosswalk";
import { useRouter } from "next/navigation";
import { answerObjectives } from "@/app/actions";
import { isFailure } from "@/lib/errors";
import { SaveBar, useAutosave } from "../autosave";
import { RegisterTable, PROVISION_HELP } from "./register-table";
import { registerLine, type Register, type RegisterRow } from "@/lib/control-register";
import { Detail } from "./control-detail";
import {
  childrenAsked,
  noteProblem,
  type Tier3Objective,
  type Tier3Value,
} from "@/lib/tier3";
import type { AnswerLookup } from "@/lib/conditions";

/**
 * Tier 3 in practice (FR-12, FR-13), as a register and a drawer (G-87).
 *
 * The register lists every control this activity requires, in one place, with
 * what state each is in. Opening a row puts that control's question beside the
 * list — the question, the four answers, and, on anything but Yes, the note
 * that becomes the finding a reviewer reads. The list holds still while a
 * person works down it, which is the whole reason it is a drawer rather than
 * a row that expands and shifts everything under the cursor.
 *
 * Children reveal only on Yes, and only where their own cross-tier conditions
 * hold; a suppressed child renders nothing at all, never a greyed placeholder
 * (§3.4). Nothing about saving changed: an answer is saved when it is given.
 */
export function ObjectivesForm({
  projectId,
  register,
  objectives,
  values,
  lookup,
  reasons,
  obligations,
  nextHref,
}: {
  projectId: string;
  /** Every control required, in whatever state it is in — the one definition. */
  register: Register;
  /** The ones the pilot actually asks a question about. */
  objectives: Tier3Objective[];
  values: Record<string, Tier3Value>;
  lookup: AnswerLookup;
  /** Why each objective is here — carried through from accumulation. */
  reasons: Record<string, string[]>;
  /** What each control also satisfies outside — composed on the server so the
   *  framework text never reaches the browser. */
  obligations: Record<string, Obligation[]>;
  nextHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<RegisterRow | null>(null);
  const drawer = React.useRef<HTMLDivElement>(null);
  const cameFrom = React.useRef<HTMLElement | null>(null);
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

  /**
   * The answers as of the last keystroke, which is not the same thing as the
   * answers React has rendered.
   *
   * Saving used to happen inside the `setGiven` updater, and a state updater
   * runs during render — so a save that failed asked the router to redraw
   * mid-render, which React refuses ("cannot update a component while
   * rendering a different one"). The ref sequences the edits; the state
   * renders them.
   */
  const latest = React.useRef<Record<string, Tier3Value>>(values);

  const set = (questionId: string, next: Partial<Tier3Value>) => {
    autosave.touched.current.add(questionId);
    const previous = latest.current;
    const merged: Record<string, Tier3Value> = {
      ...previous,
      [questionId]: {
        answer: next.answer ?? previous[questionId]?.answer ?? "Yes",
        note: next.note ?? previous[questionId]?.note ?? "",
      },
    };
    latest.current = merged;
    setGiven(merged);

    // An answer needing a note is not saved until it has one: writing it
    // half-formed would record a No with no explanation, which is the thing
    // §3.4 forbids. The note's own keystrokes then save it.
    const value = merged[questionId]!;
    if (noteProblem(value.answer, value.note) === null) {
      // Revert on refusal: the children a Yes reveals, and the note field a
      // No opens, are consequences of an answer that may not have been
      // recorded (B5).
      autosave.save(
        () => write(merged),
        () => {
          latest.current = previous;
          setGiven(previous);
        },
      );
    }
  };

  /** Only what this person touched, and only what is on screen (G-42). */
  async function write(current: Record<string, Tier3Value>) {
    const visible = new Set(
      objectives.flatMap((objective) => [
        objective.questionId,
        ...childrenAsked(
          objective,
          current[objective.questionId]?.answer ?? null,
          lookup,
        ).map((c) => c.questionId),
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
    ...childrenAsked(
      objective,
      given[objective.questionId]?.answer ?? null,
      lookup,
    ).map((c) => ({
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
      <div className="register-layout">
        <RegisterTable
          register={register}
          openId={open?.objective ?? null}
          onOpen={(row) => {
            cameFrom.current = document.activeElement as HTMLElement;
            setOpen(row);
          }}
        />

        <div
          className="register-drawer"
          ref={drawer}
          role="region"
          aria-label={open ? open.name : "Control detail"}
          onKeyDown={(event) => {
            // Escape closes and hands focus back to the row it came from —
            // focus stranded after a panel closes is the defect §23 names.
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setOpen(null);
            cameFrom.current?.focus();
          }}
        >
          {open === null ? (
            <div className="drawer-empty">
              <p className="drawer-empty-head">Pick a control to answer it</p>
              <p>
                Everything this activity requires is on the left, with what
                state each one is in. Choosing one opens its question here, and
                the list stays where it is.
              </p>
              <p className="help">{PROVISION_HELP}</p>
            </div>
          ) : (
            <Detail
              row={open}
              objective={objectives.find((o) => o.id === open.objective) ?? null}
              given={given}
              lookup={lookup}
              flagged={flagged}
              reasons={reasons[open.objective] ?? []}
              obligations={obligations[open.objective] ?? []}
              projectId={projectId}
              set={set}
              onClose={() => {
                setOpen(null);
                cameFrom.current?.focus();
              }}
            />
          )}
        </div>
      </div>

      <SaveBar
        state={autosave}
        submitLabel="Save and see where this stands →"
        blocked={flagged && missingNotes.length > 0}
        status={
          missingNotes.length === 0
            ? registerLine(register)
            : flagged
              ? `Write the ${missingNotes.length === 1 ? "note" : `${missingNotes.length} notes`} above — a reviewer reads them instead of the answer.`
              : `${answered} of ${onScreen.length} answered · ${missingNotes.length} still ${missingNotes.length === 1 ? "needs" : "need"} a note`
        }
      />
    </form>
  );
}
