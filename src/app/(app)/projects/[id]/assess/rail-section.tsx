import type * as React from "react";

export type SectionStatus = "done" | "current" | "open" | "upcoming";

/**
 * One step of the Assess stage in the rail: a numbered head, how far along
 * it is in words, and whatever the step lists beneath.
 *
 * The head is the same shape for every step so the four read as one
 * journey rather than four widgets that happen to be stacked — which is
 * what the stage looked like when each screen drew only its own rail.
 *
 * A finished step folds its rows away behind its head. Ten answered risk
 * areas above the step somebody is on pushed that step below the fold on
 * a laptop — the very complaint the rail answers — and a finished list is
 * the one a person least needs open. The head is the toggle; everything
 * in `always` stays out, because it is short and somebody may want it.
 *
 * A `<nav>` per step, each with its own name, rather than one landmark
 * for the whole rail: "Risk areas" and "Severity areas" are how assistive
 * tech and the E2E suite already address them, and a person who tabs
 * through landmarks wants the step, not the sidebar.
 */
export function RailSection({
  label,
  step,
  name,
  state,
  status,
  why,
  children,
  always,
}: {
  /** The landmark's accessible name. */
  label: string;
  step: number;
  name: string;
  /** In words: "7 of 10 answered", "after this", "nothing to narrow". */
  state: string;
  status: SectionStatus;
  /** Why this step exists at all, where that is not obvious (§24.5). */
  why?: string;
  children?: React.ReactNode;
  /** Shown even when the step is folded. */
  always?: React.ReactNode;
}) {
  const head = (
    <>
      <span className="rail-step" aria-hidden="true">
        {status === "done" ? "✓" : step}
      </span>
      <span className="rail-head-name">{name}</span>
      <span className="rail-head-state">{state}</span>
    </>
  );
  return (
    <nav aria-label={label} className={`rail-section ${status}`}>
      {status === "done" ? (
        <details className="rail-fold">
          <summary className="rail-head">{head}</summary>
          {why && <p className="rail-why">{why}</p>}
          {children}
        </details>
      ) : (
        <>
          <p className="rail-head">{head}</p>
          {why && <p className="rail-why">{why}</p>}
          {children}
        </>
      )}
      {always}
    </nav>
  );
}
