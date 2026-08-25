import Link from "next/link";
import { redirect } from "next/navigation";
import {
  askableCategories,
  CATEGORIES,
  gateStates,
  unansweredCount,
} from "@/lib/instrument";
import { litPathsFor, litPaths, assessmentLookup } from "@/lib/engine";
import { severityQuestionsFor } from "@/lib/severity";
import { groupsFor } from "../severity/severity-rail";
import { firstIncompleteSection } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { openProject } from "@/lib/project-access";
import { answerStore } from "@/lib/repo";
import { NotYourAssessment } from "../../not-yours";
import { stageOf } from "@/lib/submission";
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

  const intake = intakeValuesFrom(
    project as unknown as Record<string, unknown>,
  );
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
  const lookup = assessmentLookup({
    intake,
    gates,
    pathSelections: selections,
  });

  const open = askableCategories().filter(
    (c) =>
      c.pathQuestion &&
      gates.find((g) => g.category.key === c.key)?.answer === "Yes",
  );
  const lit = litPaths(CATEGORIES, gates, selections, intake);
  // What the rail numbers: everything except the areas nobody is asked.
  const walk = gates.filter((g) => !g.settled);
  const areas: PathArea[] = open.map((category) => {
    const state = gates.find((g) => g.category.key === category.key);
    return {
      category,
      // The rail's own number, so the two can be scanned against each
      // other. Taken from the walk the rail shows, not from this list —
      // these are only the open areas, and numbering them 1..n would put a
      // different number on the card than the one six inches to its left.
      number: walk.findIndex((g) => g.category.key === category.key) + 1,
      selected: selections[category.key] ?? [],
      // Anything the engine can explain, not only what it added. A path the
      // person ticked that WOULD have applied anyway carries its reason too,
      // and that reason used to be computed and then thrown away because the
      // filter asked about the source instead of the explanation (FR-33).
      derived: litPathsFor(
        category,
        selections[category.key] ?? [],
        lookup,
      ).filter((p) => p.because.length > 0),
      // §24.1: this area is open only because the person said they did not
      // know. Asking them five sharper questions about it is the same
      // defect one tier deeper, so the screen says so and leaves it to a
      // reviewer instead of pretending the uncertainty resolved itself.
      unsure: Boolean(state?.because?.includes("weren't sure")),
    };
  });

  const applies = gates.filter((g) => g.answer === "Yes").length;
  // Where "next" goes: the first severity area, or the summary if the lit
  // paths ask no severity questions at all.
  const asked = severityQuestionsFor(lit.map((p) => p.id));
  const severityGroups = groupsFor(asked);
  const firstSeverityHref = severityGroups[0]
    ? `/projects/${id}/assess/severity/${severityGroups[0].key}`
    : `/projects/${id}/assess/complete`;

  return (
    <main>
      <ProjectHeader
        name={project.projectName}
        status={stageOf(project.submittedAt)}
        nextLine={
          areas.length === 0
            ? "Nothing to narrow down — none of the areas that apply ask a follow-up."
            : areas.length === 1
              ? "One risk area needs narrowing — tell us which parts of it apply."
              : `${areas.length} risk areas need narrowing — tell us which parts of each one apply.`
        }
        currentStage={1}
      />

      <div className="assess-layout">
        <GateRail projectId={id} states={gates} currentKey="" />

        <section>
          <p className="eyebrow">Step 2 · Which parts apply</p>
          <h2 className="display gate-display">
            {areas.length === 0 ? "Nothing to narrow down" : "Narrow it down"}
          </h2>
          <p
            className="lede"
            style={{ textAlign: "left", margin: "0 0 1.2rem" }}
          >
            {areas.length === 0
              ? "You've told us which areas are in scope."
              : "You've told us which areas are in scope. Each one covers several different things — tick what's true and the detailed questions that follow will cover only those."}
          </p>

          {areas.length === 0 ? (
            /* Reachable and correct: answer No to everything and there is
               genuinely nothing to narrow. It used to be a dead end — no
               button, no link, the only way on was to type the URL. */
            <div className="card card-upcoming">
              <h2>Why there&rsquo;s nothing here</h2>
              <p>
                None of the areas that apply ask a follow-up question, so
                there&rsquo;s nothing for you to do here.
              </p>
              <Link className="btn" href={firstSeverityHref}>
                {severityGroups[0]
                  ? "Continue to how severe →"
                  : "See the summary →"}
              </Link>
            </div>
          ) : (
            <PathsForm
              projectId={id}
              areas={areas}
              nextHref={firstSeverityHref}
            />
          )}
        </section>
      </div>
    </main>
  );
}
