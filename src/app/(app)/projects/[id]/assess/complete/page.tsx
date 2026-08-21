import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORIES, gateStates, gateProgressHeadline,
  unansweredCount } from "@/lib/instrument";
import { intakeValuesFrom } from "@/lib/intake-values";
import { openProject } from "@/lib/project-access";
import { NotYourAssessment } from "../../not-yours";
import { answerStore } from "@/lib/repo";
import { ProjectHeader } from "../../project-header";
import { GateRail } from "../gate-rail";

export const dynamic = "force-dynamic";

export default async function GatesCompletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Authority is checked on the object, not only on the listing (N1).
  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;

  const intake = intakeValuesFrom(project as unknown as Record<string, unknown>);
  const states = gateStates(await answerStore().current(id), intake);
  const remaining = unansweredCount(states);
  const applies = states.filter((s) => s.answer === "Yes");
  const closed = states.filter((s) => s.answer === "No");

  return (
    <main>
      <ProjectHeader
        name={project.projectName}
        status="Draft"
        nextLine={
          remaining === 0
            ? "Every risk area has an answer — the detail questions come next."
            : `${remaining} risk area${remaining === 1 ? "" : "s"} still need an answer.`
        }
        currentStage={1}
      />

      <div className="assess-layout">
        <GateRail projectId={id} states={states} currentKey="" />

        <section>
          <p className="eyebrow">Step 2 · Risk areas</p>
          <h2 className="display">
            {gateProgressHeadline(CATEGORIES.length - remaining, CATEGORIES.length)}
          </h2>
          <p className="lede">
            {remaining === 0
              ? `${applies.length} of ${CATEGORIES.length} areas apply to this activity. The rest are closed — you won't be asked about them again.`
              : `Answer the remaining ${remaining} in the list, and we'll know which areas to ask about.`}
          </p>

          <div className="card">
            <h2>Applies to this activity</h2>
            {applies.length === 0 ? (
              <p className="help">Nothing yet.</p>
            ) : (
              <ul className="summary-list">
                {applies.map((s) => (
                  <li key={s.category.key}>
                    <strong>{s.category.name}</strong>
                    {s.fromIntake && s.because && (
                      <span className="meta"> — answered from your intake because {s.because}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {closed.length > 0 && (
            <div className="card">
              <h2>Closed — not applicable</h2>
              <ul className="summary-list closed">
                {closed.map((s) => (
                  <li key={s.category.key}>{s.category.name}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Honest about what does not exist yet (§24.7). */}
          <div className="card card-upcoming">
            <h2>Coming next</h2>
            <p>
              The detail questions for each area that applies, then a severity rating, then the
              controls those ratings call for. Those screens are still being built — your answers
              so far are saved.
            </p>
            <Link className="btn ghost" href={`/projects/${id}`}>
              Back to the assessment
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
