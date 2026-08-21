import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/lib/db";
import type { IntakeValues } from "@/lib/intake";
import { IntakeForm } from "./intake-form";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id));
  if (!row) notFound();

  const initial: IntakeValues = {
    projectName: row.projectName,
    businessPurpose: row.businessPurpose,
    projectDescription: row.projectDescription,
    techNonTech: row.techNonTech,
    businessOwner: row.businessOwner,
    technicalOwner: row.technicalOwner,
    collaborators: row.collaborators,
    relatedAssessments: row.relatedAssessments,
    businessUnit: row.businessUnit,
    otherUnits: row.otherUnits,
    priority: row.priority,
    lifecycleStage: row.lifecycleStage,
    vendorNames: row.vendorNames,
    vendorNotInCoupa: row.vendorNotInCoupa,
    complianceAreas: row.complianceAreas,
    dataClassification: row.dataClassification,
    dataElements: row.dataElements,
    piiTypes: row.piiTypes,
  };

  return (
    <main>
      <h1>{row.projectName}</h1>
      <p className="meta">
        Intake — the assessment&rsquo;s identity record. Last saved{" "}
        {row.updatedAt.toLocaleString()}.
      </p>
      <IntakeForm projectId={row.id} initial={initial} />
    </main>
  );
}
