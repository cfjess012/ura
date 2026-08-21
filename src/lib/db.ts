/**
 * The one database access point. Env-driven only (SPEC §6.4 obligation 2):
 * DATABASE_URL is the entire configuration surface.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __uraDb: ReturnType<typeof makeDb> | undefined;
}

function makeDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url);
  return drizzle(client, { schema });
}

export function getDb() {
  if (!globalThis.__uraDb) globalThis.__uraDb = makeDb();
  return globalThis.__uraDb;
}

export { schema };
