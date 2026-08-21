import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { createProject } from "./actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.projects.id,
      projectName: schema.projects.projectName,
      businessUnit: schema.projects.businessUnit,
      updatedAt: schema.projects.updatedAt,
    })
    .from(schema.projects)
    .orderBy(desc(schema.projects.updatedAt));

  return (
    <main>
      <p className="eyebrow">Assessments</p>
      <h1 className="display">One front door.</h1>
      <p className="lede">
        Describe the activity once. Every risk area works from the same answers
        — third-party, security, privacy, AI, legal — so nobody has to ask you
        again.
      </p>

      <div className="card">
        <label className="field" htmlFor="new-project">
          Start a new assessment
        </label>
        <p className="help">
          A working name is enough — you can change it later.
        </p>
        <form action={createProject} className="start-card">
          <input
            type="text"
            id="new-project"
            name="projectName"
            placeholder="e.g. Cadenza workforce scheduling"
            required
          />
          <button className="btn" type="submit">
            Start assessment
          </button>
        </form>
      </div>

      <h2 className="card-heading">Your assessments</h2>
      {rows.length === 0 ? (
        <div className="empty">
          <p>
            <strong>No assessments yet.</strong>
          </p>
          <p>Start one above — it takes a name and about five minutes.</p>
        </div>
      ) : (
        rows.map((p) => (
          <div className="list-row" key={p.id}>
            <Link href={`/projects/${p.id}`}>{p.projectName}</Link>
            <span className="meta">
              {p.businessUnit ? `${p.businessUnit} · ` : ""}
              updated {p.updatedAt.toLocaleDateString()}
            </span>
          </div>
        ))
      )}
    </main>
  );
}
