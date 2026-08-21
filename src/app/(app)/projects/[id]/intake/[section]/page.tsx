import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CATEGORIES } from "@/lib/instrument";
import { INTAKE_SECTIONS, sectionByKey, sectionKey, sectionProgress } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { openProject } from "@/lib/project-access";
import { projectStore } from "@/lib/repo";
import { NotYourAssessment } from "../../not-yours";
import { ProjectHeader } from "../../project-header";
import { IntakeRail } from "../intake-rail";
import { SectionForm } from "../section-form";

export const dynamic = "force-dynamic";

export default async function IntakeSectionPage({
  params,
}: {
  params: Promise<{ id: string; section: string }>;
}) {
  const { id, section: key } = await params;
  const section = sectionByKey(key);
  if (!section) notFound();

  // Authority is checked on the object, not only on the listing (N1).
  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;
  // Intake changes are attributed and kept (F5); the most recent one is
  // shown so the person can see the record exists rather than take it on
  // trust.
  const lastChange = await projectStore().lastIntakeChange(id);

  const values = intakeValuesFrom(project as unknown as Record<string, unknown>);
  const progress = sectionProgress(values);
  const index = INTAKE_SECTIONS.findIndex((s) => sectionKey(s.name) === key);
  const next = INTAKE_SECTIONS[index + 1];
  const previous = INTAKE_SECTIONS[index - 1];
  const nextHref = next
    ? `/projects/${id}/intake/${sectionKey(next.name)}`
    : `/projects/${id}/assess/${CATEGORIES[0]!.key}`;
  const outstanding = progress.reduce((sum, s) => sum + s.missing.length, 0);

  return (
    <main>
      <ProjectHeader
        name={project.projectName}
        status="Draft"
        nextLine={
          outstanding === 0
            ? "Everything we need — the risk areas come next."
            : `Tell us about the project — ${outstanding} answer${outstanding === 1 ? "" : "s"} still needed.`
        }
        currentStage={0}
      />

      <div className="assess-layout">
        <IntakeRail projectId={id} progress={progress} currentKey={key} />

        <section>
          <p className="eyebrow">
            Step 1 · Section {index + 1} of {INTAKE_SECTIONS.length}
          </p>
          <h2 className="display gate-display">{section.name}</h2>

          <SectionForm
            projectId={id}
            sectionName={section.name}
            initial={values}
            nextHref={nextHref}
            nextLabel={next ? `Next: ${next.name} →` : "Continue to the risk areas →"}
            previousHref={
              previous ? `/projects/${id}/intake/${sectionKey(previous.name)}` : `/projects`
            }
            previousLabel={previous ? "← Previous" : "← All projects"}
          />

          {lastChange && (
            <p className="attribution">
              Last change saved by{" "}
              <strong>{lastChange.byName ?? "recorded before attribution existed"}</strong>
              {" · "}
              {lastChange.at.toLocaleString()}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
