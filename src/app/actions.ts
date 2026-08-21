"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/lib/db";
import { failure, type Result } from "@/lib/errors";
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

/**
 * Save the intake. Returns a typed result rather than throwing (SPEC §25):
 * the caller cannot accidentally ignore a failure, and the requester never
 * sees a driver message.
 */
export async function saveIntake(
  projectId: string,
  formData: FormData,
): Promise<Result<{ savedAt: string }>> {
  const values: Record<string, string | string[] | Date | null> = {
    updatedAt: new Date(),
  };
  for (const field of ALL_FIELDS) {
    if (field.type === "note") continue; // asks nothing, stores nothing
    if (field.type === "multi") {
      values[field.id] = formData.getAll(field.id).map(String);
    } else {
      const v = formData.get(field.id);
      if (v !== null) {
        // A date column stores null, never "" — blank means "no date yet".
        values[field.id] =
          field.type === "date" && String(v).trim() === "" ? null : String(v);
      }
    }
  }
  // The identity record must keep a name (mirrors the DB CHECK).
  if (typeof values.projectName === "string" && !values.projectName.trim()) {
    delete values.projectName;
  }

  try {
    const db = getDb();
    const updated = await db
      .update(schema.projects)
      .set(values)
      .where(eq(schema.projects.id, projectId))
      .returning({ id: schema.projects.id });
    if (updated.length === 0) {
      return failure(
        "saveIntake",
        new Error(`no project row for ${projectId}`),
        "That assessment no longer exists. Copy your answers somewhere safe before leaving this page.",
        { retryable: false },
      );
    }
    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const, savedAt: new Date().toISOString() };
  } catch (error) {
    return failure(
      "saveIntake",
      error,
      "Couldn't save — your answers are still on screen. Check your connection and try again.",
    );
  }
}
