"use client";

import { useActionState } from "react";
import { createProject } from "@/app/actions";

/**
 * Starting an assessment. A client component for one reason: a refusal has
 * to be *shown*. The server decides who may start one, and before this the
 * refusal threw — landing the person on the generic error screen, which
 * told them the page had failed to draw and never mentioned the rule (N3).
 *
 * The refusal sits on its own line beneath the field rather than beside it.
 * As a third item in the same flex row it was competing for width with the
 * input it was complaining about, and since a refusal is usually the
 * longest string on screen, the field shrank to a third of itself at the
 * exact moment somebody was being asked to type in it.
 */
export function StartForm() {
  const [failure, action, pending] = useActionState(createProject, null);

  return (
    <form action={action}>
      <div className="start-row">
        <input
          type="text"
          id="new-project"
          name="projectName"
          placeholder="e.g. Cadenza workforce scheduling"
          disabled={pending}
          // Never colour alone (§11.1): the field is marked invalid, the
          // message is tied to it by name, and the live region reads it.
          aria-invalid={failure ? true : undefined}
          aria-describedby={failure ? "new-project-error" : undefined}
        />
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Starting…" : "Start assessment"}
        </button>
      </div>
      {/* Always present, so a live region exists before anything is put in
          it, and so the card does not jump when something is. */}
      <p
        id="new-project-error"
        role="status"
        aria-live="polite"
        className="start-error"
      >
        {failure ? (
          <>
            {failure.message}
            {failure.ref && (
              <span className="err-ref"> Reference {failure.ref}</span>
            )}
          </>
        ) : (
          ""
        )}
      </p>
    </form>
  );
}
