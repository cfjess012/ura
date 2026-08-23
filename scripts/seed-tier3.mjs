#!/usr/bin/env node
/**
 * Activate the Tier-3 objective set (NFR-8, NFR-11). Same shape as the gate
 * and severity seeds: idempotent, and an already-activated slug+version is
 * left alone because an activated version is immutable — a change is a new
 * version.
 *
 * Runs as a standalone task (§26.5).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

try {
  process.loadEnvFile(".env");
} catch {
  // Variables come from the environment (CI, ECS task definition).
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1 });

const file = join(process.cwd(), "src", "data", "instrument", "tier3.json");
const content = JSON.parse(readFileSync(file, "utf8"));
const { slug, version } = content;

const [existing] = await sql`
  select id, activated_at from instrument_versions where slug = ${slug} and version = ${version}
`;
if (existing?.activated_at) {
  console.log(`${slug}@${version} already activated (${existing.id})`);
} else if (existing) {
  await sql`update instrument_versions set activated_at = now() where id = ${existing.id}`;
  console.log(`activated ${slug}@${version} (${existing.id})`);
} else {
  const [row] = await sql`
    insert into instrument_versions (slug, version, content, activated_at)
    values (${slug}, ${version}, ${sql.json(content)}, now()) returning id`;
  console.log(`seeded and activated ${slug}@${version} (${row.id})`);
}
await sql.end();
