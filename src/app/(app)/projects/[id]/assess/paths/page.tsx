import { redirect } from "next/navigation";
import {
  askableCategories,
  CATEGORIES,
  gateStates,
  unansweredCount,
} from "@/lib/instrument";
import { litPathsFor, assessmentLookup } from "@/lib/engine";
import { firstIncompleteSection } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { openProject } from "@/lib/project-access";
import { answerStore } from "@/lib/repo";
import { NotYourAssessment } from "../../not-yours";
import { ProjectHeader } from "../../project-header";
import { GateRail } from "../gate-rail";
import { PathsForm, type PathArea } from "./paths-form";

export const dynamic = "force-dynamic";

/**
 * Step 2b — which threads apply inside each open area (FR-4).
 *
 * Nothing here is stored as "derived": the paths the engine lights are
 * recomputed on every render from the answers they came from, so changing
 * a gate or an intake answer changes this screen with no migration and no
 * stale row anywhere (NFR-3).
 */
export default async function PathsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;

  const intake = intakeValuesFrom(project as unknown as Record<string, unknown>);
  const incomplete = firstIncompleteSection(intake);
  if (incomplete) redirect(`/projects/${id}/intake/${incomplete}?needed=1`);

  const stored = await answerStore().current(id);
  const gates = gateStates(stored, intake);
  const remaining = unansweredCount(gates);
  // Every gate has to be answered before we can know what to ask about.
  if (remaining > 0) {
    const next = gates.find((g) => g.answer === null)!;
    redirect(`/projects/${id}/assess/${next.category.key}`);
  }

  const selections: Record<string, string[]> = {};
  for (const category of CATEGORIES) {
    const answer = category.pathQuestion
      ? stored[category.pathQuestion.questionId]?.value
      : undefined;
    if (Array.isArray(answer)) selections[category.key] = answer;
  }
  const lookup = assessmentLookup({ intake, gates, pathSelections: selections });

  const open = askableCategories().filter(
    (c) =>
      c.pathQuestion &&
      gates.find((g) => g.category.key === c.key)?.answer === "Yes",
  );
  const areas: PathArea[] = open.map((category) => ({
    category,
    selected: selections[category.key] ?? [],
    derived: litPathsFor(category, selections[category.key] ?? [], lookup).filter(
      (p) => p.source === "derived",
    ),
  }));

  const applies = gates.filter((g) => g.answer === "Yes").length;

  return (
    <main>
      <ProjectHeader
        name={project.projectName}
        status="Draft"
        nextLine={`${applies} risk area${applies === 1 ? "" : "s"} apply — tell us which parts of each one, and we'll only ask about those.`}
        currentStage={1}
      />

      <div className="assess-layout">
        <GateRail projectId={id} states={gates} currentKey="" />

        <section>
          <p className="eyebrow">Step 2 · Which parts apply</p>
          <h2 className="display gate-display">Narrow it down</h2>
          <p className="lede" style={{ textAlign: "left", margin: "0 0 1.2rem" }}>
            You&rsquo;ve told us which areas are in scope. Each one covers several
            different things — tick what&rsquo;s true and the detailed questions
            that follow will cover only those.
          </p>

          {areas.length === 0 ? (
            <div className="empty">
              <p>
                <strong>Nothing to narrow down.</strong>
              </p>
              <p>None of the open areas ask a follow-up.</p>
            </div>
          ) : (
            <PathsForm
              projectId={id}
              areas={areas}
              nextHref={`/projects/${id}/assess/complete`}
            />
          )}
        </section>
      </div>
    </main>
  );
}
