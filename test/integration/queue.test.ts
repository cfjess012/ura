/**
 * S13 · the reviewer's queue reads "open" the way findingIsOpen does.
 *
 * The queue's counts come from raw SQL — the one reader of the record that
 * cannot call the pure function. It used to treat any disposition row as
 * settled, so an expired risk acceptance vanished from the queue and the
 * bell while the review, the report and the packaging gate all showed it
 * open. This runs the real store against real SQL and holds it to the rule.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../../src/lib/schema";

let pg: PGlite;
let projectId: string;
let store: import("../../src/lib/repo").ProjectStore;

beforeAll(async () => {
  pg = new PGlite();
  const dir = join(__dirname, "..", "..", "drizzle");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await pg.exec(readFileSync(join(dir, file), "utf8"));
  }
  // The store reaches the database through getDb(), which hands back
  // whatever is cached on the global — so the in-memory database goes there
  // before the store is imported, and no connection string is ever read.
  (globalThis as { __uraDb?: unknown }).__uraDb = drizzle(pg, { schema });
  const { postgresProjectStore } = await import("../../src/lib/repo");
  store = postgresProjectStore();

  const project = await pg.query<{ id: string }>(
    `insert into projects (project_name, submitted_at, submitted_by)
     values ('Queue truth', now(), 'p.requester') returning id`,
  );
  projectId = project.rows[0]!.id;
});

async function raise(objective: string, questionId: string) {
  const row = await pg.query<{ id: string }>(
    `insert into findings (project_id, question_id, objective, objective_name, kind, note, raised_by)
     values ($1, $2, $3, 'A control', 'gap', 'not in place', 'p.requester') returning id`,
    [projectId, questionId, objective],
  );
  return row.rows[0]!.id;
}

describe("what the queue counts as open", () => {
  it("counts an expired risk acceptance as open, like everything else does", async () => {
    const lapsed = await raise("CTRL.LAPSED", "t3.lapsed");
    await pg.query(
      `insert into dispositions (finding_id, kind, resolved_by, note, accepted_by, expires_at)
       values ($1, 'risk-accepted', 'n.kahan', 'for a quarter', 't.holland', now() - interval '1 day')`,
      [lapsed],
    );
    const live = await raise("CTRL.LIVE", "t3.live");
    await pg.query(
      `insert into dispositions (finding_id, kind, resolved_by, note, accepted_by, expires_at)
       values ($1, 'risk-accepted', 'n.kahan', 'for a quarter', 't.holland', now() + interval '90 days')`,
      [live],
    );
    const [row] = await store.awaitingReview();
    expect(row!.counts.openGaps).toContain("CTRL.LAPSED");
    expect(row!.counts.openGaps).not.toContain("CTRL.LIVE");
  });

  it("lets the newest settlement decide, not the first one written", async () => {
    // Settled twice: an acceptance that lapsed, then a remediation. The
    // finding is settled; a reader that took the older row would reopen it.
    const twice = await raise("CTRL.TWICE", "t3.twice");
    await pg.query(
      `insert into dispositions (finding_id, kind, resolved_by, note, accepted_by, expires_at, resolved_at)
       values ($1, 'risk-accepted', 'n.kahan', 'for a while', 't.holland', now() - interval '1 day', now() - interval '10 days')`,
      [twice],
    );
    await pg.query(
      `insert into dispositions (finding_id, kind, resolved_by, note, remediation_owner, remediation_due)
       values ($1, 'remediation', 'n.kahan', 'being fixed', 'e.platform', now() + interval '30 days')`,
      [twice],
    );
    const [row] = await store.awaitingReview();
    expect(row!.counts.openGaps).not.toContain("CTRL.TWICE");
    expect(row!.counts.overdueRemediations).not.toContain("CTRL.TWICE");
  });

  it("names a remediation whose promised date has passed", async () => {
    const late = await raise("CTRL.LATE", "t3.late");
    await pg.query(
      `insert into dispositions (finding_id, kind, resolved_by, note, remediation_owner, remediation_due)
       values ($1, 'remediation', 'n.kahan', 'being fixed', 'e.platform', now() - interval '1 day')`,
      [late],
    );
    const [row] = await store.awaitingReview();
    // Settled — a remediation is not open — but overdue, and the queue says so.
    expect(row!.counts.openGaps).not.toContain("CTRL.LATE");
    expect(row!.counts.overdueRemediations).toContain("CTRL.LATE");
  });
});
