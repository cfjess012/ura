import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORIES, categoryByKey, gateStates, unansweredCount } from "@/lib/instrument";
import { intakeValuesFrom } from "@/lib/intake-values";
import { answerStore, projectStore } from "@/lib/repo";
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

  const project = await projectStore().get(id);
  if (!project) notFound();

  const intake = intakeValuesFrom(project as unknown as Record<string, unknown>);
  const stored = await answerStore().current(id);
  const states = gateStates(stored, intake);
  const state = states.find((s) => s.category.key === key)!;

  const index = CATEGORIES.findIndex((c) => c.key === key);
  const next = CATEGORIES[index + 1];
  const previous = CATEGORIES[index - 1];
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
            : `Say whether each risk area applies — ${remaining} of ${CATEGORIES.length} still to answer.`
        }
        currentStage={1}
      />

      <div className="assess-layout">
        <GateRail projectId={id} states={states} currentKey={key} />

        <section>
          <p className="eyebrow">
            Step 2 · Risk area {index + 1} of {CATEGORIES.length}
          </p>
          <h2 className="display gate-display">{category.name}</h2>

          <div className="card gate-card">
            <p className="gate-question">{category.text}</p>
            <p className="help gate-help">{category.help}</p>

            <GateForm
              projectId={id}
              categoryKey={key}
              questionId={category.questionId}
              answer={state.answer}
              fromIntake={state.fromIntake}
              because={state.because}
              nextHref={nextHref}
            />
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
              {state.answer ? "Next →" : "Skip for now →"}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
