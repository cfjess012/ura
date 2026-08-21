/**
 * The one database access point. Env-driven only (SPEC §6.4 obligation 2):
 * DATABASE_URL is the entire configuration surface.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "./config";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __uraDb: ReturnType<typeof makeDb> | undefined;
}

function makeDb() {
  // Env is read in exactly one place (§26.3); the pool stays small because
  // serverless scales instances, not connections (§26.6).
  const client = postgres(config.databaseUrl, { max: config.dbPoolMax });
  return drizzle(client, { schema });
}

export function getDb() {
  if (!globalThis.__uraDb) globalThis.__uraDb = makeDb();
  return globalThis.__uraDb;
}

export { schema };
