import Link from "next/link";
import type { GateState } from "@/lib/instrument";
import { gateStateLabel } from "@/lib/severity";
import { RailSection, type SectionStatus } from "./rail-section";

/**
 * The risk areas, as the first step of the Assess rail. What the person has
 * said so far, and where they are. Closed categories are shown as closed
 * rather than hidden — a person should be able to see the whole journey,
 * including the parts they've ruled out (§24.7), and change their mind by
 * clicking one.
 */
export function GateRail({
  projectId,
  states,
  currentKey,
  step,
  status,
}: {
  projectId: string;
  states: GateState[];
  currentKey: string;
  step: number;
  status: SectionStatus;
}) {
  // An area nobody is asked about is not a step. Numbering it put
  // "Governance · not asked" between two things somebody had to do, and
  // "8 of 11" against a walk of ten — a stop on the map that is not a stop.
  const walk = states.filter((state) => !state.settled);
  const standing = states.filter((state) => state.settled);
  const answered = walk.filter((state) => state.answer !== null).length;

  return (
    <RailSection
      label="Risk areas"
      step={step}
      name="Risk areas"
      status={status}
      state={
        // Counted over ALL the areas, and named as areas. The rail said
        // "10 answered" — ten questions asked — while the standing page
        // beside it said "8 of 11 apply". Two true numbers with no unit
        // between them read as a contradiction (owner report, G-91). One
        // denominator now, and "decided" covers both the ones a person
        // answered and the one settled from what they already told us —
        // which the line underneath names.
        answered === walk.length
          ? `all ${states.length} areas decided`
          : `${answered + standing.length} of ${states.length} areas decided`
      }
      always={
        standing.length > 0 && (
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
        )
      }
    >
      <ol>
        {walk.map((state, index) => {
          const active = state.category.key === currentKey;
          const kind = state.settled
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
                className={`rail-item ${kind}${active ? " current" : ""}`}
                aria-current={active ? "step" : undefined}
              >
                <span className="rail-num" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="rail-name">{state.category.short}</span>
                <span className="rail-state" title={gateStateLabel(state)}>
                  {gateStateLabel(state)}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </RailSection>
  );
}
