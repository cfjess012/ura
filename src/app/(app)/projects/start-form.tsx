"use client";

import { useActionState } from "react";
import { createProject } from "@/app/actions";

/**
 * Starting an assessment. A client component for one reason: a refusal has
 * to be *shown*. The server decides who may start one, and before this the
 * refusal threw — landing the person on the generic error screen, which
 * told them the page had failed to draw and never mentioned the rule (N3).
 */
export function StartForm() {
  const [failure, action, pending] = useActionState(createProject, null);

  return (
    <form action={action} className="start-card">
      <input
        type="text"
        id="new-project"
        name="projectName"
        placeholder="e.g. Cadenza workforce scheduling"
        disabled={pending}
      />
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Starting…" : "Start assessment"}
      </button>
      <p
        role="status"
        aria-live="polite"
        className={failure ? "save-failed" : "sr-only"}
      >
        {failure ? (
          <>
            {failure.message}
            {failure.ref && (
              <span className="err-ref">Reference {failure.ref}</span>
            )}
          </>
        ) : (
          ""
        )}
      </p>
    </form>
  );
}
