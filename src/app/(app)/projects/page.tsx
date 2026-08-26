import Link from "next/link";
import { currentPerson } from "@/lib/current-person";
import { requesterQueue, reviewerQueue } from "@/lib/queue-view";
import { mayAttest } from "@/lib/attestation";
import { OBJECTIVES } from "@/lib/tier3";
import {
  canStartAssessment,
  ROLE_LABEL,
  seesEveryAssessment,
} from "@/lib/people";
import { projectStore } from "@/lib/repo";
import { answerStore } from "@/lib/repo-answers";
import { intakeValuesFrom } from "@/lib/intake-values";
import { ownStanding } from "@/lib/progress";
import { ProgressMeter } from "@/app/(app)/progress-meter";
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
    // Scoped for a requester: the same counts, for the two assessments that
    // are theirs. Unscoped it would hand one person's work to another (F2).
    projectStore().awaitingReview(scope),
  ]);
  // Every answer for the listed assessments, in one query rather than one
  // per row. A reviewer's list does not say where each assessment stands —
  // their groups already do — so they pay nothing for this.
  const answers = everyone
    ? new Map<string, Record<string, never>>()
    : await answerStore().currentFor(rows.map((p) => p.id));
  const countsFor = new Map(submitted.map((p) => [p.id, p.counts]));
  const draftCount = everyone ? total - submitted.length : 0;
  // Scoped to this reader by the same authority the attest button uses.
  const mine = (questionId: string) => {
    const objective = OBJECTIVES.find((o) => o.questionId === questionId);
    return objective ? mayAttest(person, objective.id) : false;
  };
  // The requester's own view of the same idea: what is half-finished, what
  // is sitting with somebody else, and how old the oldest one is.
  const own = everyone
    ? null
    : requesterQueue(
        rows.map((p) => ({
          ...p,
          // Derived from the record every time, never read from a stored
          // "stage" column that could disagree with the answers (NFR-3).
          standing: ownStanding({
            submittedAt: p.submittedAt,
            intake: intakeValuesFrom(p.intake),
            answers: answers.get(p.id) ?? {},
            counts: countsFor.get(p.id) ?? null,
          }),
        })),
        new Date(),
      );
  const queue = reviewerQueue(submitted, new Date(), mine, (objectiveId) =>
    mayAttest(person, objectiveId),
  );

  return (
    <main>
      <p className="eyebrow">{everyone ? "Review" : "Assessments"}</p>
      <h1 className="display">
        {everyone ? "Your queue." : "One front door."}
      </h1>
      <p className="lede">
        {everyone
          ? queue.needing === 0
            ? `Nothing is waiting on you. You can still see every assessment in the pilot — ${total} in all.`
            : queue.blocking === 0
              ? `Nothing is blocked on you. ${queue.needing} assessment${queue.needing === 1 ? " is" : "s are"} waiting on their requester — worth a read.`
              : `${queue.blocking} assessment${queue.blocking === 1 ? "" : "s"} need${queue.blocking === 1 ? "s" : ""} a decision from you. Work top to bottom — the oldest is first.`
          : "Describe the activity once. Every risk area works from the same answers — third-party, security, privacy, AI, legal — so nobody has to ask you again."}
      </p>

      {canStartAssessment(person.role) && (
        <div className="card">
          <label className="field" htmlFor="new-project">
            Start a new assessment
          </label>
          <p className="help">
            A working name is enough — you can change it later.
          </p>
          <StartForm />
        </div>
      )}

      {everyone && !showingDrafts && (
        <>
          {queue.groups.length === 0 ? (
            <div className="empty">
              <p>
                <strong>Nothing is waiting on you.</strong>
              </p>
              <p>
                When a requester submits an assessment with something in your
                risk area, it appears here.
              </p>
            </div>
          ) : (
            <>
              {/* Numbers a person can act on, and only those: every one is
                  already scoped to what this reader may sign. A tile
                  counting somebody else's work is the same defect as an
                  alert that did. */}
              <div className="tiles">
                {queue.tiles.map((tile) => (
                  <div key={tile.key} className={`tile tile-${tile.tone}`}>
                    <p className="tile-label">{tile.label}</p>
                    <p className="tile-value">
                      {tile.value}
                      {tile.unit && (
                        <span className="tile-unit"> {tile.unit}</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>

              {queue.groups.map((group) => (
                <section className="queue-group" key={group.key}>
                  <h2 className={`queue-title queue-${group.key}`}>
                    {group.title}
                  </h2>
                  <p className="help">{group.because}</p>
                  {group.entries.map((entry) => (
                    <div
                      className={`queue-row queue-row-${group.key}`}
                      key={entry.id}
                    >
                      <div className="queue-row-head">
                        <Link href={`/projects/${entry.id}/report`}>
                          {entry.projectName}
                        </Link>
                        {/* Age, always. A queue sorted newest-first is how
                            something quietly waits three weeks. */}
                        <span
                          className={`queue-aged${entry.days >= 2 ? " late" : ""}`}
                        >
                          {entry.aged}
                        </span>
                      </div>
                      <p className="meta">
                        {entry.businessUnit ? `${entry.businessUnit} · ` : ""}
                        {entry.startedBy ? `${entry.startedBy} · ` : ""}
                        submitted {entry.submittedAt.toLocaleDateString()}
                      </p>
                      <p className="queue-says">{entry.says}</p>
                      <div className="queue-actions">
                        <Link
                          className="btn ghost"
                          href={`/projects/${entry.id}/report`}
                        >
                          Read the summary
                        </Link>
                        {entry.standing.some((i) => i.kind === "attest") && (
                          <Link
                            className="btn"
                            href={`/projects/${entry.id}/review`}
                          >
                            Attest controls
                          </Link>
                        )}
                        {entry.standing.some(
                          (i) =>
                            i.kind === "violation" ||
                            i.kind === "gap" ||
                            i.kind === "enhancement",
                        ) && (
                          <Link
                            className="btn ghost"
                            href={`/projects/${entry.id}/review#findings`}
                          >
                            Settle findings
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </section>
              ))}
            </>
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
          {/* Below the work, not above it. It answers a question somebody
              might have — "where do I start one?" — and answering it first
              put an explanation between a reviewer and their queue. */}
          <div className="card card-upcoming">
            <h2>Why there&rsquo;s nothing to start here</h2>
            <p>
              Assessments belong to the person who owns the activity. As a Risk
              Assessor you review what they submit — you don&rsquo;t open one on
              their behalf.
            </p>
          </div>
        </>
      )}

      {/* The requester's own list, grouped by whose move it is.
          A flat list of identical rows answers "what exists". The question
          somebody opens this page with is "which of these is mine to move,
          and which am I waiting on" — so that is what it groups on, and
          every row says which of the four steps it has reached. */}
      {own && <h2 className="card-heading">Your assessments</h2>}
      {own &&
        (own.entries.length === 0 ? (
          <div className="empty">
            <p>
              <strong>No assessments yet.</strong>
            </p>
            <p>Start one above — it takes a name and about five minutes.</p>
          </div>
        ) : (
          own.groups.map((group) => (
            <section className="queue-group" key={group.key}>
              <h2 className={`queue-title queue-${group.key}`}>
                {group.title}
                <span className="queue-count">{group.entries.length}</span>
              </h2>
              <p className="help">{group.because}</p>
              {group.entries.map((entry) => (
                <div
                  className={`queue-row queue-row-${group.key}`}
                  key={entry.id}
                >
                  <div className="queue-row-head">
                    {/* Straight to where the work is — the same landing the
                        assessment's own front door works out. */}
                    <Link href={`/projects/${entry.id}`}>
                      {entry.projectName}
                    </Link>
                    {/* A draft nobody has touched in a fortnight is the thing
                        this product exists to prevent, and it is only ever
                        loud on a draft: an assessment sitting with a reviewer
                        is not the requester's to hurry. */}
                    <span
                      className={`queue-aged${
                        entry.submittedAt === null && entry.days >= 7
                          ? " late"
                          : ""
                      }`}
                    >
                      {entry.aged}
                    </span>
                  </div>
                  <p className="meta">
                    {entry.businessUnit ? `${entry.businessUnit} · ` : ""}
                    Step {entry.standing.step} of 4 ·{" "}
                    {entry.standing.stepLabel}
                  </p>
                  <p className="queue-says">{entry.standing.says}</p>
                  {entry.standing.meter && (
                    <div className="queue-meter">
                      <ProgressMeter
                        done={entry.standing.meter.done}
                        total={entry.standing.meter.total}
                        label={entry.standing.meter.label}
                      />
                    </div>
                  )}
                </div>
              ))}
            </section>
          ))
        ))}

      {/* A reviewer asked to see the drafts too: a flat list, because a
          draft has no standing to group on until it is submitted. */}
      {everyone && showingDrafts && (
        <>
          <h2 className="card-heading">All assessments</h2>
          {rows.length === 0 ? (
            <div className="empty">
              <p>
                <strong>Nothing has been started yet.</strong>
              </p>
              <p>When a requester starts one, it appears here.</p>
            </div>
          ) : (
            rows.map((p) => (
              <div className="list-row" key={p.id}>
                <Link href={`/projects/${p.id}`}>{p.projectName}</Link>
                <span className="meta">
                  {p.businessUnit ? `${p.businessUnit} · ` : ""}
                  {p.startedBy ? `${p.startedBy} · ` : ""}
                  updated {p.updatedAt.toLocaleDateString()}
                </span>
                {p.submittedAt !== null && (
                  <span className="pill-status">In review</span>
                )}
              </div>
            ))
          )}
          <p className="list-more">
            <Link href="/projects">Back to what needs reviewing</Link>
          </p>
        </>
      )}

      {/* Say what is being withheld rather than quietly truncating (F11). */}
      {(!everyone || showingDrafts) && rows.length > 0 && (
        <>
          {!showingAll && total > rows.length && (
            <p className="list-more">
              Showing the {rows.length} most recently updated of {total}.{" "}
              <Link href="/projects?all=1">Show all {total}</Link>
            </p>
          )}
          {showingAll && total > PAGE_SIZE && (
            <p className="list-more">
              Showing all {total}.{" "}
              <Link href="/projects">Show recent only</Link>
            </p>
          )}
          {unattributed > 0 && (
            <p className="list-more">
              {unattributed} earlier assessment
              {unattributed === 1 ? " has" : "s have"} no recorded owner and
              can&rsquo;t be shown here — they were started before the platform
              recorded who was working. A Risk Assessor can still open them.
            </p>
          )}
        </>
      )}
    </main>
  );
}
