import Link from "next/link";
import { currentPerson } from "@/lib/current-person";
import { destinationFor } from "@/lib/destination";
import { gateStates } from "@/lib/instrument";
import { intakeValuesForReading } from "@/lib/intake-values";
import { openProject } from "@/lib/project-access";
import { answerStore } from "@/lib/repo-answers";
import { stageOf } from "@/lib/submission";
import {
  assembleUseCaseRecord,
  offerUseCaseRecord,
  useCaseRecordPayload,
} from "@/lib/use-case-record";
import { NotYourAssessment } from "../not-yours";
import { ProjectHeader } from "../project-header";
import { DownloadRecord } from "./record-view";

export const dynamic = "force-dynamic";

/**
 * What this assessment would file into another system's inventory
 * (FR-27, SPEC §27).
 *
 * The loudest complaint about assessment programmes is being asked the same
 * thing by different teams. This screen is the answer made visible: the
 * destination's record, assembled from answers already given, field by
 * field, with where each value came from.
 *
 * Three rules from §27, and every one is about not overclaiming.
 *
 * - **Three parts, and the third is never hidden** (§27.3). Answered,
 *   derived, and still needed. A record that showed only what it had would
 *   read as complete, and somebody would file it believing that.
 * - **The field names are provisional and say so** (§27.1), until the
 *   destination publishes its real list. A demo implying a live mapping is
 *   the claim this specification exists to prevent.
 * - **Nothing is sent, and nothing mimics being sent** (§27.4). There is no
 *   connector, so there is no button that looks like one.
 *
 * Nothing here is stored. The record is assembled on every open from what
 * the assessment holds at that moment, exactly as the ledger and the report
 * are (NFR-3) — so it cannot drift from the answers it claims to carry.
 */
export default async function RecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;
  const person = await currentPerson();

  const values = intakeValuesForReading(project as unknown as Record<string, unknown>);
  const status = stageOf(project.submittedAt);

  /**
   * Where the assessment is, not where this screen sits. This is a side
   * road off intake, not a fifth stage — marking a stage complete because
   * somebody opened a page would be §24.8 inverted, which is exactly the
   * defect the package stepper shipped with.
   */
  const stage = project.submittedAt === null ? 0 : 2;

  // A record of AI use cases is not a record of everything. Reached by URL
  // on an assessment that records no AI, this says so rather than
  // assembling a record nobody should file (§24.8: honest about what is
  // not here, never a blank panel).
  if (!offerUseCaseRecord(values)) {
    const back = destinationFor(id, "usesAi");
    return (
      <main>
        <ProjectHeader
          name={project.projectName}
          status={status}
          nextLine="Nothing to file — this assessment does not record AI."
          currentStage={stage}
        />
        <section className="assess-single">
          <div className="card">
            <p className="eyebrow">AI use case record</p>
            <h2 className="display">There is nothing to file here.</h2>
            <p className="lede">
              This record exists for activities that use AI, and this
              assessment says it does not. If that is wrong, change the
              answer and this page will fill itself in.
            </p>
            <p className="queue-actions">
              {back && (
                <Link className="btn" href={back.href}>
                  Go to that question
                </Link>
              )}
              <Link className="btn ghost" href={`/projects/${id}`}>
                Back to the assessment
              </Link>
            </p>
          </div>
        </section>
      </main>
    );
  }

  /**
   * What the platform worked out rather than asked. Supplied here because
   * deriving it needs the answers and the engine; the assembler is pure and
   * knows only the map (§26.1).
   *
   * The areas are read the same way every other surface reads them — one
   * call to `gateStates`, which is the one visibility rule (NFR-2). A
   * second way of deciding which areas apply would eventually disagree with
   * the ledger, and the record would be the one nobody checked.
   */
  const stored = await answerStore().current(id);
  const areas = gateStates(stored, values)
    // The same expression `package-actions` uses to decide an area is not
    // closed. Written as `answer === "Yes"` it gives the same set today,
    // because a settled area answers Yes — and that is exactly how two
    // readings of one rule start agreeing and then quietly stop.
    .filter((state) => state.settled || state.answer === "Yes")
    .map((state) => state.category.name);

  const record = assembleUseCaseRecord(values, {
    risk_areas: areas.join(", "),
    assessment_ref: project.projectName,
    assessment_status: status,
  });

  const payload = useCaseRecordPayload(record, person.name, new Date());

  const answered = record.rows.filter((r) => r.source.kind === "answered");
  const derived = record.rows.filter((r) => r.source.kind === "derived");
  /**
   * The two halves of "missing" are different work, and §24.9 says a count
   * may only include what the person can act on. Shown as one number, three
   * fields nobody here asks about read as three jobs the requester is
   * behind on — and on a fully-answered assessment that is the whole count.
   */
  const owed = record.missing.filter((r) => r.source.kind === "blank");
  /**
   * A submitted assessment is read-only to its requester, so an "Answer it"
   * link would promise a screen that refuses them. A destination that
   * cannot be reached is told about on the way, never discovered on
   * arrival (ui-craft pass 3).
   */
  const canAnswer = project.submittedAt === null;
  const unasked = record.missing.filter((r) => r.source.kind === "not-asked");

  return (
    <main>
      <ProjectHeader
        name={project.projectName}
        status={status}
        nextLine="Nothing is sent from here — this is what would be filed."
        currentStage={stage}
      />
      <section className="assess-single">
        <p className="eyebrow">{record.name}</p>
        <h2 className="display">What this would file.</h2>
        <p className="lede">
          Everything below comes from answers you have already given. This
          assessment supplies <strong>{record.answered} of {record.total}</strong>{" "}
          fields on the record kept in {record.where}
          {owed.length > 0 ? (
            <>
              {" "}
              — {owed.length} more {owed.length === 1 ? "is" : "are"} yours to
              answer, and {unasked.length === 0 ? "that is all" : `${unasked.length} nobody here asks for`}.
            </>
          ) : unasked.length > 0 ? (
            <>
              {" "}
              — you have answered everything this assessment asks. The{" "}
              {unasked.length} below are supplied by whoever files it.
            </>
          ) : (
            <> — nothing else is needed.</>
          )}
        </p>

        {record.provisional && (
          <p className="card note-provisional">
            <strong>These field names are ours, not theirs.</strong> They are a
            working set standing in for {record.where}&rsquo;s published list.
            When the real list arrives the names change and the answers do not.
          </p>
        )}

        <h3 className="record-head">
          Answered <span className="record-count">{answered.length}</span>
        </h3>
        <p className="record-lede">
          Each of these was answered once, on the assessment. Nobody is asked
          for it again.
        </p>
        <dl className="record-list">
          {answered.map((row) => (
            <div className="record-row" key={row.target}>
              <dt>
                {row.label}
                {row.required && <span className="record-req"> · required</span>}
              </dt>
              <dd>
                <span className="record-value">
                  {row.source.kind === "answered" ? row.source.value : ""}
                </span>
                <span className="record-from">
                  from your answer to{" "}
                  <em>
                    {row.source.kind === "answered" ? row.source.question : ""}
                  </em>
                </span>
              </dd>
            </div>
          ))}
        </dl>

        <h3 className="record-head">
          Worked out <span className="record-count">{derived.length}</span>
        </h3>
        <p className="record-lede">
          Nobody typed these. The platform reads them off the assessment, and
          says what it read.
        </p>
        <dl className="record-list">
          {derived.map((row) => (
            <div className="record-row" key={row.target}>
              <dt>
                {row.label}
                {row.required && <span className="record-req"> · required</span>}
              </dt>
              <dd>
                <span className="record-value">
                  {row.source.kind === "derived" && row.source.value
                    ? row.source.value
                    : "Worked out when this is filed"}
                </span>
                <span className="record-from">
                  {row.source.kind === "derived" ? row.source.because : ""}
                </span>
              </dd>
            </div>
          ))}
        </dl>

        {owed.length > 0 && (
          <>
            <h3 className="record-head record-head-owed">
              {canAnswer ? "Yours to answer" : "Left unanswered"}{" "}
              <span className="record-count">{owed.length}</span>
            </h3>
            <p className="record-lede">
              {canAnswer
                ? "None of it stops you — a record can be filed with gaps as long as they are known. Answering here fills the assessment too, so you only do it once."
                : "This assessment has been submitted, so these can no longer be changed here. A reviewer picks them up as part of the review."}
            </p>
            <dl className="record-list">
              {owed.map((row) => {
                const to =
                  canAnswer && row.source.kind === "blank"
                    ? (destinationFor(id, row.source.from)?.href ?? null)
                    : null;
                return (
                  <div className="record-row record-row-owed" key={row.target}>
                    <dt>
                      {row.label}
                      {row.required && (
                        <span className="record-req"> · required</span>
                      )}
                    </dt>
                    <dd>
                      <span className="record-value record-owed">
                        Not answered yet
                      </span>
                      <span className="record-from">
                        {row.source.kind === "blank" ? row.source.question : ""}
                      </span>
                      {to && (
                        <Link className="record-go" href={to}>
                          Answer it →
                        </Link>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </>
        )}

        {unasked.length > 0 && (
          <>
            <h3 className="record-head">
              Nobody here asks for these{" "}
              <span className="record-count">{unasked.length}</span>
            </h3>
            <p className="record-lede">
              The honest part, and it is not your work. This assessment does
              not ask these questions, so whoever files the record supplies
              them. They are named rather than left blank, because a gap
              nobody wrote down is indistinguishable from an oversight.
            </p>
            <dl className="record-list">
              {unasked.map((row) => (
                <div className="record-row" key={row.target}>
                  <dt>
                    {row.label}
                    {row.required && (
                      <span className="record-req"> · required</span>
                    )}
                  </dt>
                  <dd>
                    <span className="record-value record-unasked">
                      The assessment does not ask
                    </span>
                    <span className="record-from">
                      {row.source.kind === "not-asked" ? row.source.because : ""}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}

        <div className="card record-file">
          <h3>Filing it</h3>
          <p>
            The payload is real and you can take it away. Sending it is not
            built: there is no connection to {record.where} from here, so
            there is no button that pretends otherwise. Somebody files this
            by hand today, and the download is what they file from.
          </p>
          <p className="queue-actions">
            <DownloadRecord payload={payload} assessment={project.projectName} />
            <Link className="btn ghost" href={`/projects/${id}`}>
              Back to the assessment
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
