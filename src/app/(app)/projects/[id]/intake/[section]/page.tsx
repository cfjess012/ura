import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { askableCategories } from "@/lib/instrument";
import { INTAKE_SECTIONS, sectionByKey, sectionKey, sectionProgress } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { openProject } from "@/lib/project-access";
import { peopleStore, projectStore } from "@/lib/repo";
import { NotYourAssessment } from "../../not-yours";
import { SectionForm } from "../section-form";

export const dynamic = "force-dynamic";

export default async function IntakeSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; section: string }>;
  searchParams: Promise<{ needed?: string }>;
}) {
  const [{ id, section: key }, { needed }] = await Promise.all([params, searchParams]);
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

  // The employee directory, read on the server. People are operational
  // rather than versioned (G-46), so the picker's options come from here
  // and not from a file — and never from the component.
  const directory = (await peopleStore().list()).map((person) => ({
    id: person.id,
    // Title beside the name: two people share a name, and picking an owner
    // is choosing a role as much as a person.
    label: person.title ? `${person.name} — ${person.title}` : person.name,
  }));
  const values = intakeValuesFrom(project as unknown as Record<string, unknown>);
  const progress = sectionProgress(values);
  const index = INTAKE_SECTIONS.findIndex((s) => sectionKey(s.name) === key);
  const next = INTAKE_SECTIONS[index + 1];
  const previous = INTAKE_SECTIONS[index - 1];
  const nextHref = next
    ? `/projects/${id}/intake/${sectionKey(next.name)}`
    : `/projects/${id}/assess/${askableCategories()[0]!.key}`;
  const outstanding = progress.reduce((sum, s) => sum + s.missing.length, 0);

  return (
    <main>
      <SectionForm
        projectName={project.projectName}
        stepLine={`Step 1 · Section ${index + 1} of ${INTAKE_SECTIONS.length}`}
        needed={Boolean(needed)}
        projectId={id}
        sectionName={section.name}
        initial={values}
        nextHref={nextHref}
        nextLabel={next ? `Next: ${next.name} →` : "Continue to the risk areas →"}
        previousHref={
          previous ? `/projects/${id}/intake/${sectionKey(previous.name)}` : `/projects`
        }
        previousLabel={previous ? "← Previous" : "← All projects"}
        sectionKey={key}
        people={directory}
        lastChange={
          lastChange
            ? {
                by: lastChange.byName ?? "recorded before attribution existed",
                at: lastChange.at.toLocaleString(),
              }
            : null
        }
      />
    </main>
  );
}
