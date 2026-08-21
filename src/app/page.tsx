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
      <h1>Assessments</h1>
      <p className="meta">
        One front door: describe the activity once, and every risk area works
        from it.
      </p>

      <div className="card">
        <form action={createProject} style={{ display: "flex", gap: "0.6rem" }}>
          <input
            type="text"
            name="projectName"
            placeholder="Project name"
            aria-label="Project name"
            required
          />
          <button className="btn" type="submit">
            Start assessment
          </button>
        </form>
      </div>

      <h2>All projects</h2>
      <div className="list">
        {rows.length === 0 && (
          <p className="meta">
            Nothing yet — start the first assessment above.
          </p>
        )}
        {rows.map((p) => (
          <div className="card row" key={p.id}>
            <Link href={`/projects/${p.id}`}>{p.projectName}</Link>
            <span className="meta">
              {p.businessUnit ? `${p.businessUnit} · ` : ""}
              updated {p.updatedAt.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
