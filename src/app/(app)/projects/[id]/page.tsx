import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { sectionProgress, INTAKE_SECTIONS, sectionKey } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { projectStore } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * The project's front door lands on the first section that still needs
 * something — a person should never have to work out where they were.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await projectStore().get(id);
  if (!project) notFound();

  const values = intakeValuesFrom(project as unknown as Record<string, unknown>);
  const progress = sectionProgress(values);
  const firstIncomplete = progress.find((s) => s.missing.length > 0);
  const target = firstIncomplete?.key ?? sectionKey(INTAKE_SECTIONS[0]!.name);
  redirect(`/projects/${id}/intake/${target}`);
}
