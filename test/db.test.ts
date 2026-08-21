/**
 * S1 acceptance — persistence (FR-2, NFR-8/§10 migration safety): the REAL
 * SQL migration is applied to in-memory Postgres and queried through the
 * Drizzle schema, so schema.ts and drizzle/*.sql cannot drift silently.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { projects } from "../src/lib/schema";

let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  const pg = new PGlite();
  const dir = join(__dirname, "..", "drizzle");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await pg.exec(readFileSync(join(dir, file), "utf8"));
  }
  db = drizzle(pg);
});

describe("projects persistence (FR-2)", () => {
  it("round-trips a full intake record including multi-selects", async () => {
    const [row] = await db
      .insert(projects)
      .values({
        projectName: "Cadenza pilot",
        businessUnit: "Workforce Ops",
        dataClassification: ["Internal", "Confidential"],
        piiTypes: ["Name, address, phone, email"],
      })
      .returning();
    const [read] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, row!.id));
    expect(read!.projectName).toBe("Cadenza pilot");
    expect(read!.dataClassification).toEqual(["Internal", "Confidential"]);
    expect(read!.piiTypes).toEqual(["Name, address, phone, email"]);
    expect(read!.businessPurpose).toBe(""); // defaults, not nulls
  });

  it("rejects a blank project name (the identity record keeps its name)", async () => {
    // Drizzle wraps the driver error; the CHECK name rides on the cause.
    const error = await db
      .insert(projects)
      .values({ projectName: "   " })
      .then(
        () => null,
        (e: { message?: string; cause?: { message?: string } }) => e,
      );
    expect(error).not.toBeNull();
    expect(`${error?.message ?? ""} ${error?.cause?.message ?? ""}`).toMatch(
      /project_name_not_blank/,
    );
  });
});
