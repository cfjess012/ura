import { notFound } from "next/navigation";
import { missingRequired } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { projectStore } from "@/lib/repo";
import Link from "next/link";
import { CATEGORIES } from "@/lib/instrument";
import { IntakeForm } from "./intake-form";
import { ProjectHeader } from "./project-header";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await projectStore().get(id);
  if (!row) notFound();

  const initial = intakeValuesFrom(row as unknown as Record<string, unknown>);

  const outstanding = missingRequired(initial).length;
  const nextLine =
    outstanding === 0
      ? "Intake is complete — the risk questions come next."
      : `Tell us about the project — ${outstanding} question${outstanding === 1 ? "" : "s"} left before the assessment can start.`;

  return (
    <main>
      <ProjectHeader
        name={row.projectName}
        status="Draft"
        nextLine={nextLine}
        currentStage={0}
      />

      <p className="eyebrow">Step 1 · Intake</p>
      <h2 className="display">Tell us about the project.</h2>
      <p className="lede">
        Plain answers are fine — this is the record every risk area works from,
        so nobody has to ask you the same thing twice.
      </p>

      <IntakeForm projectId={row.id} initial={initial} />

      {outstanding === 0 ? (
        <div className="card next-step">
          <div>
            <h2>Next: the risk areas</h2>
            <p className="help">
              {CATEGORIES.length} short questions — one per risk area — to work out which parts of
              the assessment apply to this activity. Some are already answered from what you told
              us here.
            </p>
          </div>
          <Link className="btn" href={`/projects/${row.id}/assess/${CATEGORIES[0]!.key}`}>
            Continue →
          </Link>
        </div>
      ) : (
        <p className="meta" style={{ textAlign: "center", marginTop: "1.4rem" }}>
          Everything you provide becomes the source material for the assessment.
        </p>
      )}
    </main>
  );
}
