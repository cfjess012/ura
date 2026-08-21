import Link from "next/link";
import { currentPerson } from "@/lib/current-person";
import {
  canStartAssessment,
  ROLE_LABEL,
  seesEveryAssessment,
} from "@/lib/people";
import { projectStore } from "@/lib/repo";
import { createProject } from "@/app/actions";

export const dynamic = "force-dynamic";

/** How many rows a listing shows before it says so out loud (F11). */
const PAGE_SIZE = 25;

/**
 * The list is scoped to what the person is entitled to see (§2, F2): a
 * requester's own work, or — for a Risk Assessor or an administrator —
 * everyone's, which is the job. Before this fix every role saw every
 * project under a heading that said "Your assessments".
 */
export default async function Projects({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const [person, { all }] = await Promise.all([currentPerson(), searchParams]);
  const everyone = seesEveryAssessment(person.role);
  const scope = everyone ? {} : { createdBy: person.id };
  const showingAll = all === "1";

  const [rows, total] = await Promise.all([
    projectStore().list({ ...scope, limit: showingAll ? undefined : PAGE_SIZE }),
    projectStore().count(scope),
  ]);

  return (
    <main>
      <p className="eyebrow">{everyone ? "Review" : "Assessments"}</p>
      <h1 className="display">
        {everyone ? "Everything in flight." : "One front door."}
      </h1>
      <p className="lede">
        {everyone
          ? `You're signed in as ${ROLE_LABEL[person.role]}, so you can see every assessment in the pilot — not only your own. Open one to follow the answers and where they came from.`
          : "Describe the activity once. Every risk area works from the same answers — third-party, security, privacy, AI, legal — so nobody has to ask you again."}
      </p>

      {canStartAssessment(person.role) ? (
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
      ) : (
        <div className="card card-upcoming">
          <h2>Why there&rsquo;s nothing to start here</h2>
          <p>
            Assessments belong to the person who owns the activity. As a Risk
            Assessor you review what they submit — you don&rsquo;t open one on
            their behalf.
          </p>
        </div>
      )}

      <h2 className="card-heading">
        {everyone ? "All assessments" : "Your assessments"}
      </h2>

      {rows.length === 0 ? (
        <div className="empty">
          <p>
            <strong>
              {everyone ? "Nothing has been started yet." : "No assessments yet."}
            </strong>
          </p>
          <p>
            {everyone
              ? "When a requester starts one, it appears here."
              : "Start one above — it takes a name and about five minutes."}
          </p>
        </div>
      ) : (
        <>
          {rows.map((p) => (
            <div className="list-row" key={p.id}>
              <Link href={`/projects/${p.id}`}>{p.projectName}</Link>
              <span className="meta">
                {p.businessUnit ? `${p.businessUnit} · ` : ""}
                {everyone && p.startedBy ? `${p.startedBy} · ` : ""}
                updated {p.updatedAt.toLocaleDateString()}
              </span>
            </div>
          ))}
          {/* Say what is being withheld rather than quietly truncating (F11). */}
          {!showingAll && total > rows.length && (
            <p className="list-more">
              Showing the {rows.length} most recently updated of {total}.{" "}
              <Link href="/projects?all=1">Show all {total}</Link>
            </p>
          )}
          {showingAll && total > PAGE_SIZE && (
            <p className="list-more">
              Showing all {total}. <Link href="/projects">Show recent only</Link>
            </p>
          )}
        </>
      )}
    </main>
  );
}
