"use client";

/**
 * The offer to file this as an AI use case record (FR-26, SPEC §27).
 *
 * It appears beside the AI question and nowhere else, because that is the
 * answer that makes it an AI use case at all.
 *
 * Four rules from §27, and every one of them is about not overclaiming:
 *
 * - **The count is real.** "16 of 22 already answered" is computed from the
 *   map and the answers on screen, every render. A number a person repeats
 *   in a room has to be one the product worked out (G-34).
 * - **It never blocks.** It is an offer beside the field, not a step.
 * - **The field names are provisional and say so**, until the destination's
 *   published list arrives. A screen implying a mapping we do not have is
 *   the claim this specification exists to prevent (§27.1).
 * - **Nothing is sent.** The write is out of scope and the offer does not
 *   pretend otherwise (§27.4).
 */
import * as React from "react";
import Link from "next/link";
import {
  assembleUseCaseRecord,
  offerUseCaseRecord,
} from "@/lib/use-case-record";
import type { IntakeValues } from "@/lib/intake";

export function RegisterUseCase({
  projectId,
  values,
}: {
  projectId: string;
  /**
   * The values ON SCREEN, so the count moves as they type rather than
   * reporting the last save.
   *
   * Form values, ids and all: this counts whether a field is answered, and
   * an id is as answered as a label. The record VIEW is a different matter —
   * it prints the values, and must be handed the reading form (NFR-9).
   */
  values: IntakeValues;
}) {
  if (!offerUseCaseRecord(values)) return null;
  const record = assembleUseCaseRecord(values);
  const left = record.total - record.answered;

  return (
    <aside className="usecase" aria-label="AI use case record">
      <p className="usecase-head">
        <span aria-hidden="true" className="usecase-dot" />
        Also file this in {record.where}?
      </p>
      <p className="usecase-body">
        This assessment already answers{" "}
        <strong>
          {record.answered} of {record.total}
        </strong>{" "}
        fields on the {record.name}
        {left > 0 ? (
          <>
            {" "}
            — {left} would still need{" "}
            {left === 1 ? "an answer" : "answers"}, and we name{" "}
            {left === 1 ? "it" : "them"} rather than guessing.
          </>
        ) : (
          <> — nothing else is needed.</>
        )}
      </p>
      <p className="usecase-acts">
        <Link className="usecase-go" href={`/projects/${projectId}/record`}>
          See what it would file →
        </Link>
      </p>
      {record.provisional && (
        <p className="usecase-caveat">
          Field names are a working set, not {record.where}&rsquo;s published
          list, and nothing is sent from here.
        </p>
      )}
    </aside>
  );
}
