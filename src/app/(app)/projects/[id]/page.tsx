import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { currentPerson } from "@/lib/current-person";
import { canAttest } from "@/lib/people";
import { sectionProgress } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { openProject } from "@/lib/project-access";
import { NotYourAssessment } from "./not-yours";

export const dynamic = "force-dynamic";

/**
 * The project's front door lands where the work actually is — a person
 * should never have to work out where they were.
 *
 * With intake incomplete that is the first section still needing something.
 * With intake FINISHED it is the risk areas: sending a completed assessment
 * back to "Section 1 of 4" under a banner reading "Everything we need — the
 * risk areas come next" made the person click Next three times to reach the
 * thing the banner had just named (verifier finding 6).
 *
 * Once it is submitted, where the work is depends on who is asking: the
 * reviewer's queue for a Risk Assessor, the submitted record for everyone
 * else. Without this an assessor had no route into their own workspace at
 * all — they had to be handed the URL.
 */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Authority is checked on the object, not only on the listing (N1).
  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;

  if (project.submittedAt !== null) {
    const person = await currentPerson();
    redirect(`/projects/${id}/${canAttest(person.role) ? "review" : "submit"}`);
  }

  const values = intakeValuesFrom(
    project as unknown as Record<string, unknown>,
  );
  const progress = sectionProgress(values);
  const firstIncomplete = progress.find((s) => s.missing.length > 0);
  if (firstIncomplete)
    redirect(`/projects/${id}/intake/${firstIncomplete.key}`);
  redirect(`/projects/${id}/assess/complete`);
}
