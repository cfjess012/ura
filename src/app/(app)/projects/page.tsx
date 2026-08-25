import Link from "next/link";
import { currentPerson } from "@/lib/current-person";
import { reviewStanding } from "@/lib/review-standing";
import {
  canStartAssessment,
  ROLE_LABEL,
  seesEveryAssessment,
} from "@/lib/people";
import { projectStore } from "@/lib/repo";
import { StartForm } from "./start-form";

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
  searchParams: Promise<{ all?: string; drafts?: string }>;
}) {
  const [person, { all, drafts }] = await Promise.all([
    currentPerson(),
    searchParams,
  ]);
  const everyone = seesEveryAssessment(person.role);
  const scope = everyone ? {} : { createdBy: person.id };
  const showingAll = all === "1";
  // A reviewer's list is a queue, and a draft is not in it: nothing can be
  // attested, no finding exists yet, and opening one shows a form somebody
  // else is still filling in. Shown on request rather than hidden, because
  // a list that quietly omits things is the defect F11 named.
  const showingDrafts = drafts === "1";

  const [rows, total, unattributed, submitted] = await Promise.all([
    projectStore().list({
      ...scope,
      limit: showingAll ? undefined : PAGE_SIZE,
    }),
    projectStore().count(scope),
    everyone ? Promise.resolve(0) : projectStore().countUnattributed(),
    everyone ? projectStore().awaitingReview() : Promise.resolve([]),
  ]);
  const draftCount = everyone ? total - submitted.length : 0;

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
          <StartForm />
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
        {everyone
          ? showingDrafts
            ? "All assessments"
            : "Submitted for review"
          : "Your assessments"}
      </h2>

      {everyone && !showingDrafts && (
        <>
          {submitted.length === 0 ? (
            <div className="empty">
              <p>
                <strong>Nothing has been submitted yet.</strong>
              </p>
              <p>
                When a requester submits one, it appears here with what it
                raised.
              </p>
            </div>
          ) : (
            submitted.map((p) => {
              const standing = reviewStanding(p.id, p.counts);
              return (
                <div className="review-row" key={p.id}>
                  <div className="review-row-head">
                    {/* The handoff summary, not the raw queue: it is the
                        page written for somebody arriving at this
                        assessment for the first time. The chips below go
                        straight to the work. */}
                    <Link href={`/projects/${p.id}/report`}>
                      {p.projectName}
                    </Link>
                    <span className="meta">
                      {p.businessUnit ? `${p.businessUnit} · ` : ""}
                      {p.startedBy ? `${p.startedBy} · ` : ""}
                      submitted {p.submittedAt.toLocaleDateString()}
                    </span>
                  </div>
                  {standing.length === 0 ? (
                    <p className="review-row-clear">
                      Nothing outstanding — every answer is attested and no
                      finding is open.
                    </p>
                  ) : (
                    <ul className="review-row-items">
                      {standing.map((item) => (
                        <li key={item.kind}>
                          <Link
                            className={`chip chip-${item.kind}`}
                            href={item.href}
                          >
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
          {draftCount > 0 && (
            <p className="list-more">
              {draftCount} assessment{draftCount === 1 ? " is" : "s are"} still
              being written and {draftCount === 1 ? "isn't" : "aren't"} shown —
              there is nothing to review until{" "}
              {draftCount === 1 ? "it is" : "they are"} submitted.{" "}
              <Link href="/projects?drafts=1">Show them anyway</Link>
            </p>
          )}
        </>
      )}

      {(!everyone || showingDrafts) &&
        (rows.length === 0 ? (
          <div className="empty">
            <p>
              <strong>
                {everyone
                  ? "Nothing has been started yet."
                  : "No assessments yet."}
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
                {/* A reviewer's list showed no sign of which assessments were
                  waiting on them — the one thing it is for (§24.7). */}
                {p.submittedAt !== null && (
                  <span className="pill-status">In review</span>
                )}
              </div>
            ))}
            {/* Say what is being withheld rather than quietly truncating (F11). */}
            {!showingAll && total > rows.length && (
              <p className="list-more">
                Showing the {rows.length} most recently updated of {total}.{" "}
                <Link href="/projects?all=1">Show all {total}</Link>
              </p>
            )}
            {unattributed > 0 && (
              <p className="list-more">
                {unattributed} earlier assessment
                {unattributed === 1 ? " has" : "s have"} no recorded owner and
                can&rsquo;t be shown here — they were started before the
                platform recorded who was working. A Risk Assessor can still
                open them.
              </p>
            )}
            {showingAll && total > PAGE_SIZE && (
              <p className="list-more">
                Showing all {total}.{" "}
                <Link href="/projects">Show recent only</Link>
              </p>
            )}
            {everyone && showingDrafts && (
              <p className="list-more">
                <Link href="/projects">Back to what needs reviewing</Link>
              </p>
            )}
          </>
        ))}
    </main>
  );
}
