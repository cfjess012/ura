/**
 * Documents a requester supplied — text only (§3.6 is open; see migration
 * 0023 for why nothing binary is kept).
 *
 * Its own store module rather than another method on the answer store: a
 * document is evidence a person handed over, and it is read by the drafting
 * pass and by whatever highlights a quote later.
 */
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";

export type StoredDocument = {
  id: string;
  name: string;
  body: string;
  uploadedBy: string;
  uploadedAt: Date;
};

export interface DocumentStore {
  add(input: {
    projectId: string;
    name: string;
    body: string;
    uploadedBy: string;
  }): Promise<StoredDocument>;
  forProject(projectId: string): Promise<StoredDocument[]>;
}

export function postgresDocumentStore(): DocumentStore {
  const db = getDb();
  return {
    async add(input) {
      const [row] = await db
        .insert(schema.documents)
        .values({
          projectId: input.projectId,
          name: input.name,
          body: input.body,
          uploadedBy: input.uploadedBy,
        })
        .returning();
      const stored = row!;
      return {
        id: stored.id,
        name: stored.name,
        body: stored.body,
        uploadedBy: stored.uploadedBy,
        uploadedAt: stored.uploadedAt,
      };
    },
    async forProject(projectId) {
      const rows = await db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.projectId, projectId))
        .orderBy(desc(schema.documents.uploadedAt));
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        body: row.body,
        uploadedBy: row.uploadedBy,
        uploadedAt: row.uploadedAt,
      }));
    },
  };
}

export function documentStore(): DocumentStore {
  return postgresDocumentStore();
}
