#!/usr/bin/env node
/**
 * Give the end-to-end suite its own database.
 *
 * Why: the suite creates a project on nearly every test, and it used to
 * create them in the development database. Within a few weeks the pilot's
 * assessment list was mostly rows called "Scope 1787327552901" — the list a
 * demo opens on (F11). A test that leaves residue in the environment a
 * person works in is a test with a side effect.
 *
 * Creates the database if it does not exist, applies every migration, and
 * activates the instrument — the same three steps a fresh environment takes,
 * which is also the point: if this script works, a new machine works.
 *
 * Runs as a standalone task (§26.5).
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env: the variables are expected to come from the environment (CI).
}

const url = process.env.E2E_DATABASE_URL;
if (!url) {
  throw new Error(
    "E2E_DATABASE_URL is not set. Local: copy the line from .env.example into .env. CI: set it on the job.",
  );
}

const target = new URL(url);
const dbName = target.pathname.replace(/^\//, "");
if (!dbName) throw new Error("E2E_DATABASE_URL has no database name");

// Connect to the server's default database to ask whether ours exists.
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
const [exists] = await admin`select 1 from pg_database where datname = ${dbName}`;
if (!exists) {
  try {
    // Identifier, not a value: it cannot be a bound parameter.
    await admin.unsafe(`create database "${dbName.replace(/"/g, '""')}"`);
    console.log(`created database ${dbName}`);
  } catch (error) {
    // Say what to do, not what the driver said (§25 applies to tools too).
    if (String(error?.message).includes("permission denied")) {
      throw new Error(
        `The database role in E2E_DATABASE_URL may not create databases. Either create "${dbName}" by hand, or grant the role once:\n  psql -d postgres -c 'alter role <role> createdb;'`,
      );
    }
    throw error;
  }
}
await admin.end();

const env = { ...process.env, DATABASE_URL: url };
execFileSync("node", ["scripts/migrate.mjs"], { env, stdio: "inherit" });
execFileSync("node", ["scripts/seed-instrument.mjs"], { env, stdio: "inherit" });
execFileSync("node", ["scripts/seed-severity.mjs"], { env, stdio: "inherit" });
execFileSync("node", ["scripts/seed-tier3.mjs"], { env, stdio: "inherit" });
console.log(`e2e database ready: ${dbName}`);
