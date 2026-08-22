import Link from "next/link";
import type { CurrentAnswer } from "@/lib/repo";
import type { SeverityQuestion } from "@/lib/severity";

export type SeverityGroup = { key: string; name: string; questions: SeverityQuestion[] };

export const groupKey = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Severity questions grouped by the area they belong to, in instrument order. */
export function groupsFor(questions: SeverityQuestion[]): SeverityGroup[] {
  const order: string[] = [];
  const byName = new Map<string, SeverityQuestion[]>();
  for (const q of questions) {
    if (!byName.has(q.category)) {
      byName.set(q.category, []);
      order.push(q.category);
    }
    byName.get(q.category)!.push(q);
  }
  return order.map((name) => ({ key: groupKey(name), name, questions: byName.get(name)! }));
}

/** Where the person is in Tier 2, and how much of each area is answered. */
export function SeverityRail({
  projectId,
  groups,
  answered,
  currentKey,
}: {
  projectId: string;
  groups: SeverityGroup[];
  answered: Record<string, CurrentAnswer>;
  currentKey: string;
}) {
  return (
    <nav className="rail" aria-label="Severity areas">
      <p className="rail-title">How severe</p>
      <ol>
        {groups.map((group, index) => {
          const done = group.questions.filter((q) => answered[q.questionId]).length;
          const complete = done === group.questions.length;
          const active = group.key === currentKey;
          const status = complete ? "open" : done > 0 ? "prefilled" : "unanswered";
          return (
            <li key={group.key}>
              <Link
                href={`/projects/${projectId}/assess/severity/${group.key}`}
                className={`rail-item ${status}${active ? " current" : ""}`}
                aria-current={active ? "step" : undefined}
              >
                <span className="rail-num" aria-hidden="true">
                  {complete ? "✓" : index + 1}
                </span>
                <span className="rail-name">{group.name}</span>
                <span className="rail-state">
                  {complete ? "Complete" : `${done} of ${group.questions.length}`}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      {/*
        A way back into the flow. Tier 2 replaced the risk-areas rail with
        this one and offered no route up, so someone who realised mid-way
        that they had ticked the wrong thread could only reach it through
        the URL bar (S4 verification, F5). Changing a thread here changes
        which severity questions exist, so this is not a nicety.
      */}
      <div className="rail-back">
        <Link href={`/projects/${projectId}/assess/paths`} className="rail-back-link">
          ← Change which parts apply
        </Link>
        <Link href={`/projects/${projectId}/assess/complete`} className="rail-back-link">
          Where this assessment stands
        </Link>
      </div>
    </nav>
  );
}
