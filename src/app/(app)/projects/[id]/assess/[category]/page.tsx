import Link from "next/link";
import { notFound } from "next/navigation";
import { askableCategories, categoryByKey, gateStates, unansweredCount } from "@/lib/instrument";
import { intakeValuesFrom } from "@/lib/intake-values";
import { openProject } from "@/lib/project-access";
import { NotYourAssessment } from "../../not-yours";
import { answerStore } from "@/lib/repo";
import { ProjectHeader } from "../../project-header";
import { GateForm } from "../gate-form";
import { GateRail } from "../gate-rail";

export const dynamic = "force-dynamic";

export default async function GatePage({
  params,
}: {
  params: Promise<{ id: string; category: string }>;
}) {
  const { id, category: key } = await params;
  const category = categoryByKey(key);
  if (!category) notFound();

  // Authority is checked on the object, not only on the listing (N1).
  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;

  const intake = intakeValuesFrom(project as unknown as Record<string, unknown>);
  const stored = await answerStore().current(id);
  const states = gateStates(stored, intake);
  const state = states.find((s) => s.category.key === key)!;

  // Navigation walks only what a person is actually asked (C-8): a settled
  // area is shown in the rail and on the summary, never as a step to take.
  const askable = askableCategories();
  const index = askable.findIndex((c) => c.key === key);
  const next = askable[index + 1];
  const previous = askable[index - 1];
  const nextHref = next ? `/projects/${id}/assess/${next.key}` : `/projects/${id}/assess/complete`;
  const remaining = unansweredCount(states);

  return (
    <main>
      <ProjectHeader
        name={project.projectName}
        status="Draft"
        nextLine={
          remaining === 0
            ? "Every risk area has an answer — the detail questions come next."
            : `Say whether each risk area applies — ${remaining} of ${askable.length} still to answer.`
        }
        currentStage={1}
      />

      <div className="assess-layout">
        <GateRail projectId={id} states={states} currentKey={key} />

        <section>
          <p className="eyebrow">
            {state.settled
              ? "Step 2 · Risk areas"
              : `Step 2 · Risk area ${index + 1} of ${askable.length}`}
          </p>
          <h2 className="display gate-display">{category.name}</h2>

          <div className="card gate-card">
            <p className="gate-question">{category.text}</p>
            <p className="help gate-help">{category.help}</p>

            {state.settled ? (
              /* Reachable by link, never by the journey (C-8). Saying "there
                 is no question here, and here is why" is the whole point of
                 removing it — a silent redirect would look like a bug. */
              <p className="prefill" role="note">
                <span className="prefill-tag">Nothing to answer</span>
                <span>
                  We&rsquo;ve recorded this as applying because {state.because}. A
                  reviewer covers it either way.
                </span>
              </p>
            ) : (
            <GateForm
              projectId={id}
              categoryKey={key}
              questionId={category.questionId}
              answer={state.answer}
              fromIntake={state.fromIntake}
              because={state.because}
              nextHref={nextHref}
            />
            )}
          </div>

          <div className="gate-nav">
            {previous ? (
              <Link className="btn ghost" href={`/projects/${id}/assess/${previous.key}`}>
                ← Previous
              </Link>
            ) : (
              <Link className="btn ghost" href={`/projects/${id}`}>
                ← Back to intake
              </Link>
            )}
            <Link className="btn ghost" href={nextHref}>
              {state.settled || state.answer ? "Next →" : "Skip for now →"}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
