// Applies drizzle/*.sql in filename order, once each (ledger: _migrations).
// Plain JS on purpose: runs anywhere node runs, no build step.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env: variables come from the environment (CI, ECS task definition).
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
// Notices ("relation already exists, skipping") are expected on every run
// after the first. Printing them as raw objects made a healthy migration read
// like a stack trace, so they are silenced; real errors still throw.
const sql = postgres(url, { max: 1, onnotice: () => {} });

await sql`create table if not exists _migrations (
  name text primary key, applied_at timestamptz not null default now()
)`;
const applied = new Set((await sql`select name from _migrations`).map((r) => r.name));
const dir = join(process.cwd(), "drizzle");
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (applied.has(file)) continue;
  await sql.begin(async (tx) => {
    await tx.unsafe(readFileSync(join(dir, file), "utf8"));
    await tx`insert into _migrations (name) values (${file})`;
  });
  console.log(`applied ${file}`);
}
await sql.end();
console.log("migrations up to date");
