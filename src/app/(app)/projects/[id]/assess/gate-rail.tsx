import Link from "next/link";
import type { GateState } from "@/lib/instrument";

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
  return (
    <nav className="rail" aria-label="Risk areas">
      <p className="rail-title">Risk areas</p>
      <ol>
        {states.map((state, index) => {
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
                <span className="rail-state">
                  {status === "settled"
                    ? "Applies · not asked"
                    : status === "closed"
                      ? "Not applicable"
                      : status === "prefilled"
                        ? state.origin === "answers"
                          ? "Yes · from your answers"
                          : "Yes · from intake"
                        : status === "open"
                          ? "Applies"
                          : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
