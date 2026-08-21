#!/usr/bin/env node
/** Activate the Tier-2 severity instrument (same rules as the gates seed). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
try { process.loadEnvFile(".env"); } catch { /* env comes from the environment */ }
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1, onnotice: () => {} });
const content = JSON.parse(
  readFileSync(join(process.cwd(), "src", "data", "instrument", "severity.json"), "utf8"),
);
const { slug, version } = content;
const [existing] = await sql`
  select id, activated_at from instrument_versions where slug = ${slug} and version = ${version}`;
if (existing?.activated_at) console.log(`instrument ${slug}@${version} already active (${existing.id})`);
else if (existing) {
  await sql`update instrument_versions set activated_at = now() where id = ${existing.id}`;
  console.log(`activated ${slug}@${version}`);
} else {
  const [row] = await sql`
    insert into instrument_versions (slug, version, content, activated_at)
    values (${slug}, ${version}, ${sql.json(content)}, now()) returning id`;
  console.log(`seeded and activated ${slug}@${version} (${row.id})`);
}
await sql.end();
