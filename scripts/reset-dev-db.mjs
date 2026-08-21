#!/usr/bin/env node
/**
 * Rebuild the development database from nothing (N6).
 *
 * Why this exists as a task rather than a SQL script: an assessment holding
 * answers **cannot be deleted** — the insert-only trigger refuses, and the
 * cascade from projects goes down with it (F13). That is correct: evidence
 * outranks tidiness. It also means there is no "delete the test rows" query,
 * so the only honest way back to a clean environment is to drop the database
 * and rebuild it, which is exactly what a fresh machine does anyway.
 *
 * DESTRUCTIVE. Requires --yes, and refuses to touch a database whose name
 * does not look like a local development one.
 *
 * Runs as a standalone task (§26.5).
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env: variables come from the environment.
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set.");
if (!process.argv.includes("--yes")) {
  throw new Error(
    "This drops the development database and everything in it. Re-run with --yes if that is what you want.",
  );
}

const target = new URL(url);
const dbName = target.pathname.replace(/^\//, "");
if (!/^(localhost|127\.0\.0\.1)$/.test(target.hostname)) {
  throw new Error(`Refusing to drop a database on ${target.hostname}. This task is for local development only.`);
}
if (/prod|production|live/i.test(dbName)) {
  throw new Error(`Refusing to drop a database named "${dbName}".`);
}

const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
const quoted = `"${dbName.replace(/"/g, '""')}"`;
// Sessions holding the database open (a running dev server) block the drop.
await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${dbName} and pid <> pg_backend_pid()`;
await admin.unsafe(`drop database if exists ${quoted}`);
await admin.unsafe(`create database ${quoted}`);
await admin.end();
console.log(`recreated ${dbName}`);

execFileSync("node", ["scripts/migrate.mjs"], { env: process.env, stdio: "inherit" });
execFileSync("node", ["scripts/seed-instrument.mjs"], { env: process.env, stdio: "inherit" });
console.log(`${dbName} is clean: migrations applied, instrument activated, no assessments.`);
