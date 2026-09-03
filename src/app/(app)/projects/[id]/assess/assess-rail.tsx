import Link from "next/link";
import type { AssessJourney } from "@/lib/assess-journey";
import { GateRail } from "./gate-rail";
import { RailFocus } from "./rail-focus";
import { RailSection, type SectionStatus } from "./rail-section";
import { SeverityRail } from "./severity/severity-rail";

/** Which step of the stage the screen is, and which row on it. */
export type RailPosition =
  | { section: "areas"; key: string }
  | { section: "parts" }
  | { section: "severity"; key: string }
  | { section: "controls" }
  | null;

/**
 * The Assess stage as one map: four steps, each derived from the last,
 * with the person's position marked and every reachable row a link.
 *
 * Owner-reported, 2026-09-02, from the parts screen: "it just randomly
 * takes you to this narrow section — does that logic make sense?" The
 * logic did; the presentation hid it. That screen drew the risk-areas
 * rail with nothing highlighted, "Next" on the last area said only
 * "Next", and at severity the rail was swapped for a different one with a
 * back-link. This draws the whole stage on every screen of it.
 */
export function AssessRail({
  projectId,
  journey,
  at,
}: {
  projectId: string;
  journey: AssessJourney;
  at: RailPosition;
}) {
  const base = `/projects/${projectId}/assess`;
  const areasDone = journey.gatesRemaining === 0;
  const partsDone = areasDone && journey.partsRemaining === 0;
  const severityDone =
    partsDone &&
    journey.severity.length > 0 &&
    journey.severityRemaining === 0;
  const controlsDone =
    journey.controls.total > 0 &&
    journey.controls.answered === journey.controls.total;

  const status = (
    section: NonNullable<RailPosition>["section"],
    done: boolean,
    reachable: boolean,
  ): SectionStatus =>
    at?.section === section
      ? "current"
      : done
        ? "done"
        : reachable
          ? "open"
          : "upcoming";

  const partNames = journey.parts.map((p) => p.category.short);
  const partsWhy =
    journey.parts.length === 0
      ? undefined
      : `Shown because ${
          partNames.length === 1
            ? partNames[0]
            : `${partNames.slice(0, -1).join(", ")} and ${partNames.at(-1)}`
        } ${partNames.length === 1 ? "applies" : "apply"}`;

  return (
    <aside className="rail" aria-label="Where you are in the assessment">
      <p className="rail-stage">Step 2 · Assess</p>
      <RailFocus />

      <GateRail
        projectId={projectId}
        states={journey.gates}
        currentKey={at?.section === "areas" ? at.key : ""}
        step={1}
        status={status("areas", areasDone, true)}
      />

      <RailSection
        label="Which parts apply"
        step={2}
        name="Which parts"
        status={status("parts", partsDone, journey.reach.parts)}
        state={
          !areasDone
            ? "after this"
            : journey.parts.length === 0
              ? "nothing to narrow"
              : journey.partsRemaining === 0
                ? `${journey.parts.length} answered`
                : `${journey.parts.length - journey.partsRemaining} of ${journey.parts.length} answered`
        }
        why={partsWhy}
      >
        {journey.parts.length > 0 && (
          <ol>
            {journey.parts.map((part) => {
              const kind = !journey.reach.parts
                ? "upcoming"
                : part.answered
                  ? "open"
                  : "unanswered";
              const body = (
                <>
                  <span className="rail-num" aria-hidden="true">
                    {part.number}
                  </span>
                  <span className="rail-name">{part.category.short}</span>
                  <span className="rail-state">
                    {!journey.reach.parts
                      ? `${part.total} parts`
                      : part.answered
                        ? `${part.ticked} of ${part.total} ticked`
                        : "Not yet"}
                  </span>
                </>
              );
              return (
                <li key={part.category.key}>
                  {journey.reach.parts ? (
                    <Link
                      href={`${base}/paths`}
                      className={`rail-item ${kind}${at?.section === "parts" ? " current" : ""}`}
                      aria-current={at?.section === "parts" ? "step" : undefined}
                    >
                      {body}
                    </Link>
                  ) : (
                    <span className={`rail-item ${kind}`}>{body}</span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </RailSection>

      <SeverityRail
        projectId={projectId}
        groups={journey.severity}
        currentKey={at?.section === "severity" ? at.key : ""}
        step={3}
        status={status("severity", severityDone, journey.reach.severity)}
        reachable={journey.reach.severity}
      />

      <RailSection
        label="Controls"
        step={4}
        name="Controls"
        status={status("controls", controlsDone, journey.reach.controls)}
        state={
          !journey.reach.controls
            ? "after this"
            : journey.controls.total === 0
              ? "nothing to ask yet"
              : `${journey.controls.answered} of ${journey.controls.total} answered`
        }
      >
        {journey.reach.controls && journey.controls.total > 0 && (
          <ol>
            <li>
              <Link
                href={`${base}/objectives`}
                className={`rail-item ${controlsDone ? "open" : journey.controls.answered > 0 ? "prefilled" : "unanswered"}${at?.section === "controls" ? " current" : ""}`}
                aria-current={at?.section === "controls" ? "step" : undefined}
              >
                <span className="rail-num" aria-hidden="true">
                  {controlsDone ? "✓" : journey.controls.total}
                </span>
                <span className="rail-name">What this activity requires</span>
                <span className="rail-state">
                  {controlsDone
                    ? "Complete"
                    : `${journey.controls.answered} of ${journey.controls.total}`}
                </span>
              </Link>
            </li>
          </ol>
        )}
      </RailSection>

      <p className="rail-foot">
        <Link href={`${base}/complete`}>Where this assessment stands →</Link>
      </p>
    </aside>
  );
}
