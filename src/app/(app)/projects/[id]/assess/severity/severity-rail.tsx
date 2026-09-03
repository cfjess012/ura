import Link from "next/link";
import type { JourneySeverity } from "@/lib/assess-journey";
import { RailSection, type SectionStatus } from "../rail-section";

// Callers of the old rail imported the grouping from here. It is pure
// logic and lives in the library now; the name stays reachable so nothing
// that only wanted the grouping has to know the rail changed.
export {
  groupsFor,
  severityGroupKey as groupKey,
  type SeverityGroup,
} from "@/lib/severity";

/**
 * How severe, as the third step of the Assess rail: each area's questions
 * and how many are answered. Rows are links only once the step can be
 * opened — the screen redirects anyone who arrives early, and a link that
 * bounces reads as broken (§24.4).
 */
export function SeverityRail({
  projectId,
  groups,
  currentKey,
  step,
  status,
  reachable,
}: {
  projectId: string;
  groups: JourneySeverity[];
  currentKey: string;
  step: number;
  status: SectionStatus;
  reachable: boolean;
}) {
  const remaining = groups.reduce((sum, g) => sum + (g.total - g.done), 0);
  return (
    <RailSection
      label="Severity areas"
      step={step}
      name="How severe"
      status={status}
      state={
        !reachable
          ? "after this"
          : groups.length === 0
            ? "nothing to ask"
            : remaining === 0
              ? `${groups.length} answered`
              : `${remaining} to answer`
      }
    >
      {groups.length > 0 && (
        <ol>
          {groups.map((group, index) => {
            const complete = group.done === group.total;
            const active = group.key === currentKey;
            const kind = !reachable
              ? "upcoming"
              : complete
                ? "open"
                : group.done > 0
                  ? "prefilled"
                  : "unanswered";
            const body = (
              <>
                <span className="rail-num" aria-hidden="true">
                  {reachable && complete ? "✓" : index + 1}
                </span>
                <span className="rail-name">{group.name}</span>
                <span className="rail-state">
                  {!reachable
                    ? `${group.total} question${group.total === 1 ? "" : "s"}`
                    : complete
                      ? "Complete"
                      : `${group.done} of ${group.total}`}
                </span>
              </>
            );
            return (
              <li key={group.key}>
                {reachable ? (
                  <Link
                    href={`/projects/${projectId}/assess/severity/${group.key}`}
                    className={`rail-item ${kind}${active ? " current" : ""}`}
                    aria-current={active ? "step" : undefined}
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
  );
}
