/**
 * The §5 invariants, proven against real SQL (NFR-1, NFR-11). These are the
 * guarantees that must live in the schema rather than in application code —
 * so the test attacks the database directly, bypassing every code path the
 * product uses.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

let pg: PGlite;
let projectId: string;
let versionId: string;

beforeAll(async () => {
  pg = new PGlite();
  const dir = join(__dirname, "..", "..", "drizzle");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(join(dir, file), "utf8"));
  }
  const project = await pg.query<{ id: string }>(
    "insert into projects (project_name) values ('Invariants') returning id",
  );
  projectId = project.rows[0]!.id;
  const version = await pg.query<{ id: string }>(
    `insert into instrument_versions (slug, version, content, activated_at)
     values ('tier1-gates', 'test.1', '{}'::jsonb, now()) returning id`,
  );
  versionId = version.rows[0]!.id;
});

async function insertAnswer(value: string, source = "person", confirmed = true) {
  const result = await pg.query<{ id: string }>(
    `insert into answers (project_id, question_id, value, source, confirmed, instrument_version_id)
     values ($1, 'gate.ai', $2::jsonb, $3, $4, $5) returning id`,
    [projectId, JSON.stringify(value), source, confirmed, versionId],
  );
  return result.rows[0]!.id;
}

describe("answers are insert-only (NFR-1)", () => {
  it("refuses UPDATE at the database, not in application code", async () => {
    const id = await insertAnswer("Yes");
    await expect(
      pg.query("update answers set value = '\"No\"'::jsonb where id = $1", [id]),
    ).rejects.toThrow(/insert-only/);
  });

  it("refuses DELETE — history is not editable", async () => {
    const id = await insertAnswer("Yes");
    await expect(pg.query("delete from answers where id = $1", [id])).rejects.toThrow(
      /insert-only/,
    );
  });

  it("a correction is a new row, and both rows survive", async () => {
    await insertAnswer("Yes");
    await insertAnswer("No");
    const rows = await pg.query<{ count: string }>(
      "select count(*)::text as count from answers where project_id = $1 and question_id = 'gate.ai'",
      [projectId],
    );
    expect(Number(rows.rows[0]!.count)).toBeGreaterThanOrEqual(2);
  });

  it("rejects an unknown source, and a 'person' answer that is not confirmed", async () => {
    await expect(insertAnswer("Yes", "agent")).rejects.toThrow(/answers_source_known/);
    await expect(insertAnswer("Yes", "person", false)).rejects.toThrow(
      /answers_person_is_confirmed/,
    );
  });
});

describe("activated instrument versions are immutable (NFR-11)", () => {
  it("refuses any change once activated — a change is a new version", async () => {
    await expect(
      pg.query("update instrument_versions set content = '{\"x\":1}'::jsonb where id = $1", [
        versionId,
      ]),
    ).rejects.toThrow(/activated and immutable/);
  });

  it("refuses deletion once activated — an assessment pins the version it was asked under (F4)", async () => {
    await expect(
      pg.query("delete from instrument_versions where id = $1", [versionId]),
    ).rejects.toThrow(/activated and cannot be deleted/);
  });

  it("allows a draft version to be deleted — it was never asked", async () => {
    const draft = await pg.query<{ id: string }>(
      `insert into instrument_versions (slug, version, content)
       values ('tier1-gates', 'draft.deletable', '{}'::jsonb) returning id`,
    );
    await pg.query("delete from instrument_versions where id = $1", [draft.rows[0]!.id]);
    const gone = await pg.query("select 1 from instrument_versions where id = $1", [
      draft.rows[0]!.id,
    ]);
    expect(gone.rows).toHaveLength(0);
  });

  it("allows edits while a version is still a draft", async () => {
    const draft = await pg.query<{ id: string }>(
      `insert into instrument_versions (slug, version, content)
       values ('tier1-gates', 'draft.1', '{}'::jsonb) returning id`,
    );
    await pg.query("update instrument_versions set activated_at = now() where id = $1", [
      draft.rows[0]!.id,
    ]);
    const after = await pg.query<{ activated_at: string | null }>(
      "select activated_at from instrument_versions where id = $1",
      [draft.rows[0]!.id],
    );
    expect(after.rows[0]!.activated_at).not.toBeNull();
  });
});

describe("evidence outranks tidiness (F13)", () => {
  it("refuses to delete a project once it holds answers, cascade or not", async () => {
    // projects → answers is ON DELETE CASCADE, which reads like a licence to
    // erase evidence. It is not: the cascade fires the insert-only trigger,
    // and the whole delete fails. This test pins that, because the day the
    // trigger is relaxed is the day the cascade quietly becomes real.
    const doomed = await pg.query<{ id: string }>(
      "insert into projects (project_name) values ('Doomed') returning id",
    );
    await pg.query(
      `insert into answers (project_id, question_id, value, source, confirmed, instrument_version_id)
       values ($1, 'gate.thirdParty', '"Yes"'::jsonb, 'person', true, $2)`,
      [doomed.rows[0]!.id, versionId],
    );
    await expect(
      pg.query("delete from projects where id = $1", [doomed.rows[0]!.id]),
    ).rejects.toThrow(/insert-only/);
  });
});

describe("intake history is evidence too (F5)", () => {
  it("keeps the previous value and the author, and refuses to be rewritten", async () => {
    await pg.query(
      `insert into intake_events (project_id, field_id, previous_value, value, changed_by)
       values ($1, 'dataClassification', '["Internal"]'::jsonb, '["Confidential"]'::jsonb, 'p.requester')`,
      [projectId],
    );
    const row = await pg.query<{ id: string; previous_value: string[]; changed_by: string }>(
      "select id, previous_value, changed_by from intake_events where project_id = $1",
      [projectId],
    );
    expect(row.rows[0]!.previous_value).toEqual(["Internal"]);
    expect(row.rows[0]!.changed_by).toBe("p.requester");

    await expect(
      pg.query("update intake_events set value = '[]'::jsonb where id = $1", [row.rows[0]!.id]),
    ).rejects.toThrow(/insert-only/);
    await expect(
      pg.query("delete from intake_events where id = $1", [row.rows[0]!.id]),
    ).rejects.toThrow(/insert-only/);
  });
});

describe("attribution (S2.5)", () => {
  it("seeds one person per role, and rejects an unknown role", async () => {
    const rows = await pg.query<{ role: string; count: string }>(
      "select role, count(*)::text as count from people group by role order by role",
    );
    expect(rows.rows.map((r) => r.role)).toEqual(["admin", "assessor", "requester"]);
    await expect(
      pg.query("insert into people (id, name, role) values ('x', 'X', 'auditor')"),
    ).rejects.toThrow(/people_role_known/);
  });

  it("records who answered, and refuses an author who does not exist", async () => {
    const withAuthor = await pg.query<{ answered_by: string }>(
      `insert into answers (project_id, question_id, value, source, confirmed, instrument_version_id, answered_by)
       values ($1, 'gate.ai', '"Yes"'::jsonb, 'person', true, $2, 'p.assessor') returning answered_by`,
      [projectId, versionId],
    );
    expect(withAuthor.rows[0]!.answered_by).toBe("p.assessor");

    await expect(
      pg.query(
        `insert into answers (project_id, question_id, value, source, confirmed, instrument_version_id, answered_by)
         values ($1, 'gate.ai', '"Yes"'::jsonb, 'person', true, $2, 'p.ghost')`,
        [projectId, versionId],
      ),
    ).rejects.toThrow();
  });

  it("allows no author, because rows written before people existed cannot be attributed", async () => {
    const anonymous = await pg.query<{ answered_by: string | null }>(
      `insert into answers (project_id, question_id, value, source, confirmed, instrument_version_id)
       values ($1, 'gate.data_privacy', '"Yes"'::jsonb, 'intake', false, $2) returning answered_by`,
      [projectId, versionId],
    );
    expect(anonymous.rows[0]!.answered_by).toBeNull();
  });
});

/**
 * S4.5 — the employee directory is not a list of logins (G-46).
 *
 * Adding the directory made every one of the fifteen people a sign-in
 * persona on the front door, and moved the default person from Priya
 * Sharma to whoever sorted first alphabetically. Both surfaces called
 * `list()`, which is right for an owner picker and wrong for a door.
 */
describe("only personas can be signed in as", () => {
  it("the directory is bigger than the sign-in list", async () => {
    const all = await pg.query<{ count: number }>("select count(*)::int as count from people");
    const personas = await pg.query<{ count: number }>(
      "select count(*)::int as count from people where signs_in",
    );
    expect(personas.rows[0]!.count).toBe(3);
    expect(all.rows[0]!.count).toBeGreaterThan(personas.rows[0]!.count);
  });

  it("the personas are exactly one of each role", async () => {
    const rows = await pg.query<{ role: string }>(
      "select role from people where signs_in order by role",
    );
    expect(rows.rows.map((r) => r.role)).toEqual(["admin", "assessor", "requester"]);
  });

  it("directory people carry an address and cannot sign in", async () => {
    const rows = await pg.query<{ email: string; signs_in: boolean }>(
      "select email, signs_in from people where id like 'd.%'",
    );
    expect(rows.rows.length).toBeGreaterThan(5);
    for (const row of rows.rows) {
      expect(row.signs_in).toBe(false);
      expect(row.email).toMatch(/@stelly\.com$/);
    }
  });
});
