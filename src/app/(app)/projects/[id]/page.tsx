import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { sectionProgress, INTAKE_SECTIONS, sectionKey } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { openProject } from "@/lib/project-access";
import { NotYourAssessment } from "./not-yours";

export const dynamic = "force-dynamic";

/**
 * The project's front door lands on the first section that still needs
 * something — a person should never have to work out where they were.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Authority is checked on the object, not only on the listing (N1).
  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;

  const values = intakeValuesFrom(project as unknown as Record<string, unknown>);
  const progress = sectionProgress(values);
  const firstIncomplete = progress.find((s) => s.missing.length > 0);
  const target = firstIncomplete?.key ?? sectionKey(INTAKE_SECTIONS[0]!.name);
  redirect(`/projects/${id}/intake/${target}`);
}
