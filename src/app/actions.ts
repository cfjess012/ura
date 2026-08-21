"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/lib/db";
import { ALL_FIELDS } from "@/lib/intake";

export async function createProject(formData: FormData) {
  const name = String(formData.get("projectName") ?? "").trim();
  if (!name) throw new Error("Give the assessment a project name to start.");
  const db = getDb();
  const [row] = await db
    .insert(schema.projects)
    .values({ projectName: name })
    .returning({ id: schema.projects.id });
  redirect(`/projects/${row!.id}`);
}

export async function saveIntake(projectId: string, formData: FormData) {
  const db = getDb();
  const values: Record<string, string | string[] | Date> = {
    updatedAt: new Date(),
  };
  for (const field of ALL_FIELDS) {
    if (field.type === "multi") {
      values[field.id] = formData.getAll(field.id).map(String);
    } else {
      const v = formData.get(field.id);
      if (v !== null) values[field.id] = String(v);
    }
  }
  // The identity record must keep a name (mirrors the DB CHECK).
  if (typeof values.projectName === "string" && !values.projectName.trim()) {
    delete values.projectName;
  }
  await db
    .update(schema.projects)
    .set(values)
    .where(eq(schema.projects.id, projectId));
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const, savedAt: new Date().toISOString() };
}
