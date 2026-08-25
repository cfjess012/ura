import Link from "next/link";
import type { GateState } from "@/lib/instrument";
import { gateStateLabel } from "@/lib/severity";

/**
 * Where the person is in Tier 1, and what they've said so far. Closed
 * categories are shown as closed rather than hidden — a person should be
 * able to see the whole journey, including the parts they've ruled out
 * (§24.7), and change their mind by clicking one.
 */
export function GateRail({
  projectId,
  states,
  currentKey,
}: {
  projectId: string;
  states: GateState[];
  currentKey: string;
}) {
  // An area nobody is asked about is not a step. Numbering it put
  // "Governance · not asked" between two things somebody had to do, and
  // "8 of 11" against a walk of ten — a stop on the map that is not a stop.
  const walk = states.filter((state) => !state.settled);
  const standing = states.filter((state) => state.settled);

  return (
    <nav className="rail" aria-label="Risk areas">
      <p className="rail-title">Risk areas</p>
      <ol>
        {walk.map((state, index) => {
          const active = state.category.key === currentKey;
          const status = state.settled
            ? "settled"
            : state.answer === null
              ? "unanswered"
              : state.answer === "No"
                ? "closed"
                : state.fromIntake
                  ? "prefilled"
                  : "open";
          return (
            <li key={state.category.key}>
              <Link
                href={`/projects/${projectId}/assess/${state.category.key}`}
                className={`rail-item ${status}${active ? " current" : ""}`}
                aria-current={active ? "step" : undefined}
              >
                <span className="rail-num" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="rail-name">{state.category.short}</span>
                <span className="rail-state">{gateStateLabel(state)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      {/*
        Named rather than dropped. It applies to every assessment and asks
        nothing, so it is noise as a step — but silence would read as it not
        being covered, and it is. One line, and still reachable.
      */}
      {standing.length > 0 && (
        <p className="rail-standing">
          {standing.map((state) => (
            <Link
              key={state.category.key}
              href={`/projects/${projectId}/assess/${state.category.key}`}
              className="rail-standing-link"
            >
              {state.category.short} applies to every assessment
            </Link>
          ))}
        </p>
      )}
    </nav>
  );
}
