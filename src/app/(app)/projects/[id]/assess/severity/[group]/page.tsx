import { notFound, redirect } from "next/navigation";
import { CATEGORIES, gateStates } from "@/lib/instrument";
import { litPaths } from "@/lib/engine";
import { firstIncompleteSection } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { openProject } from "@/lib/project-access";
import { answerStore } from "@/lib/repo";
import {
  deriveBand,
  severityQuestionsFor,
  type Band,
  type SeverityQuestion,
} from "@/lib/severity";
import { NotYourAssessment } from "../../../not-yours";
import { ProjectHeader } from "../../../project-header";
import * as React from "react";
import { FocusOnArrival } from "@/app/(app)/focus-on-arrival";
import { SeverityForm, type SeverityItem } from "../severity-form";
import { SeverityRail, groupKey, groupsFor } from "../severity-rail";

export const dynamic = "force-dynamic";

/**
 * Step 3 — how severe, one category at a time (§24.2).
 *
 * Which questions exist here is a function of the Tier-1 paths that are
 * lit, recomputed on every render. Close a gate upstream and these
 * questions stop being asked, with nothing to migrate (NFR-3).
 */
export default async function SeverityPage({
  params,
}: {
  params: Promise<{ id: string; group: string }>;
}) {
  const { id, group } = await params;

  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;

  const intake = intakeValuesFrom(project as unknown as Record<string, unknown>);
  const incomplete = firstIncompleteSection(intake);
  if (incomplete) redirect(`/projects/${id}/intake/${incomplete}?needed=1`);

  const stored = await answerStore().current(id);
  const gates = gateStates(stored, intake);
  if (gates.some((g) => g.answer === null)) {
    redirect(`/projects/${id}/assess/${gates.find((g) => g.answer === null)!.category.key}`);
  }

  const selections: Record<string, string[]> = {};
  for (const category of CATEGORIES) {
    const value = category.pathQuestion
      ? stored[category.pathQuestion.questionId]?.value
      : undefined;
    if (Array.isArray(value)) selections[category.key] = value;
  }
  const stillToNarrow = gates.some(
    (g) => g.answer === "Yes" && g.category.pathQuestion && selections[g.category.key] === undefined,
  );
  if (stillToNarrow) redirect(`/projects/${id}/assess/paths`);

  const lit = litPaths(CATEGORIES, gates, selections, intake);
  const asked = severityQuestionsFor(lit.map((p) => p.id));
  const groups = groupsFor(asked);
  const here = groups.find((g) => g.key === group);
  if (!here) notFound();

  const items: SeverityItem[] = here.questions.map((question: SeverityQuestion) => {
    const answer = stored[question.questionId]?.value;
    const detailAnswer = question.detail ? stored[question.detail.questionId]?.value : undefined;
    return {
      question,
      band: typeof answer === "string" ? (answer as Band) : null,
      detail: Array.isArray(detailAnswer) ? detailAnswer : [],
      derived: deriveBand(question, intake),
    };
  });

  const index = groups.findIndex((g) => g.key === group);
  const next = groups[index + 1];
  const answeredEverywhere = asked.filter((q) => stored[q.questionId]).length;

  return (
    <main>
      <ProjectHeader
        name={project.projectName}
        status="Draft"
        nextLine={
          answeredEverywhere === asked.length
            ? "Every severity question has an answer — the control questions come next."
            : `How severe — ${asked.length - answeredEverywhere} of ${asked.length} still to answer.`
        }
        currentStage={1}
      />

      <div className="assess-layout">
        <SeverityRail projectId={id} groups={groups} answered={stored} currentKey={group} />

        <section>
          <p className="eyebrow">
            Step 3 · {index + 1} of {groups.length}
          </p>
          <h2 className="display gate-display">{here.name}</h2>
          <p className="lede" style={{ textAlign: "left", margin: "0 0 1.2rem" }}>
            Pick the description that fits. They&rsquo;re written as facts you can
            check rather than judgements, so two people reading the same
            situation land in the same place.
          </p>

          <React.Suspense fallback={null}>
            <FocusOnArrival />
          </React.Suspense>
          <SeverityForm
            projectId={id}
            items={items}
            nextHref={
              next
                ? `/projects/${id}/assess/severity/${next.key}`
                : `/projects/${id}/assess/complete`
            }
            nextLabel={next ? `Next: ${next.name} →` : "See the summary →"}
          />
        </section>
      </div>
    </main>
  );
}
