import Link from "next/link";
import { packageState } from "@/app/package-actions";
import { currentPerson } from "@/lib/current-person";
import { openProject } from "@/lib/project-access";
import { stageOf } from "@/lib/submission";
import { isFailure } from "@/lib/errors";
import { NotYourAssessment } from "../not-yours";
import { ProjectHeader } from "../project-header";
import { PackageView } from "./package-view";

export const dynamic = "force-dynamic";

/**
 * Stage 4 (SPEC §4.5) — the assessment as a record another system replays.
 *
 * The stepper has promised this screen since stage one, which is right: a
 * requester should see the whole journey including the parts they have not
 * reached. It stopped being right once the stepper was the only thing that
 * knew about it — a stage nobody can open reads as broken rather than as
 * upcoming.
 *
 * Nothing is computed here. The gate and the assembly are both server-side
 * in package-actions, because a screen is never the enforcement point.
 */
export default async function PackagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;
  const person = await currentPerson();

  /**
   * Where the assessment actually is — not where this screen sits.
   *
   * Stages before the current one read as done, so a hardcoded stage 4
   * (out of range on a four-entry stepper, indices 0–3) marked every stage
   * complete: a Draft that had never been submitted showed ✓ Package.
   * That is §24.8 exactly inverted, in the one place a person looks to
   * find out what is left. The review screen already does this — it says
   * stage 1 on an assessment nobody has submitted — and this follows it.
   */
  const stageOfWork = (ready: boolean) =>
    project.submittedAt === null ? 1 : ready ? 3 : 2;

  const state = await packageState(id);
  if (isFailure(state)) {
    // A failure is still a screen (§25). It says what happened, whether
    // their work is safe, what to do, and the reference that was already
    // written to the log — and it keeps the header and a way out, because
    // a sentence alone on a page with no navigation strands somebody.
    return (
      <main>
        <ProjectHeader
          name={project.projectName}
          status={stageOf(project.submittedAt)}
          nextLine="Nothing has been recorded — this can be tried again."
          currentStage={stageOfWork(false)}
        />
        <section className="assess-single">
          <div className="card owed-blocked">
            {/* A card heading is a short label in this product, not a
                sentence — the message goes in the body, where it reads as
                one instead of being shouted in letter-spaced caps. */}
            <h2>Nothing was recorded</h2>
            <p role="alert">
              {state.message} Nothing has been lost — a package is assembled
              fresh every time this page opens, so trying again is safe.
              {state.ref ? (
                <span className="meta"> Reference {state.ref}</span>
              ) : null}
            </p>
            <div className="queue-actions">
              <Link className="btn" href={`/projects/${id}/package`}>
                Try again
              </Link>
              <Link className="btn ghost" href={`/projects/${id}/report`}>
                Back to the handoff summary
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const ready = state.blockers.length === 0;

  return (
    <main>
      <ProjectHeader
        name={project.projectName}
        status={stageOf(project.submittedAt)}
        nextLine={
          ready
            ? "Everything is attested and settled — this can be packaged."
            : "Not ready to package yet — what is outstanding is named below."
        }
        currentStage={stageOfWork(ready)}
      />

      <section className="assess-single">
        <p className="eyebrow">Stage 4</p>
        <h2 className="display">
          {ready ? "Ready to package." : "Not ready yet."}
        </h2>
        <p className="lede">
          A package is the assessment as a record another system can replay:
          every attested answer with the person who signed it, every finding
          with how it was settled, and the coverage of what was asked and why.
        </p>

        {!ready && (
          <div className="card owed-blocked">
            <h2>What is outstanding</h2>
            <p className="help">
              Packaging says a named person checked each answer. That claim is
              the whole point of the export, so it cannot be made over work
              nobody has done — but you can see exactly what is left.
            </p>
            <ul className="summary-list">
              {state.blockers.map((blocker) => (
                <li key={blocker.kind}>
                  <strong>{blocker.says}</strong>
                  {/* Named, not counted (§19). Somebody who has to work out
                      which four of their answers are unsigned is being sent
                      back to the queue to do the product's job. */}
                  {blocker.names.length > 0 && (
                    <ul className="blocker-names">
                      {blocker.names.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  )}
                  <p className="help" style={{ margin: "0.3rem 0 0" }}>
                    <Link href={`/projects/${id}${blocker.href}`}>
                      {blocker.kind === "not-submitted"
                        ? "Go to submission →"
                        : "Go to the review queue →"}
                    </Link>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {ready && state.payload && (
          <PackageView
            projectId={id}
            payload={state.payload}
            history={state.history}
          />
        )}

        <div className="card card-upcoming">
          <h2>Where this sits</h2>
          <p>
            You are signed in as <strong>{person.name}</strong>.{" "}
            {ready
              ? "Anyone who can open this assessment can take the payload; recording a package is attributed to whoever does it, and a later export adds a record rather than replacing one."
              : "There is no payload to take yet. Once the outstanding work above is done, anyone who can open this assessment can take it, and recording a package is attributed to whoever does it."}
          </p>
          <Link className="btn ghost" href={`/projects/${id}/report`}>
            Back to the handoff summary
          </Link>
        </div>
      </section>
    </main>
  );
}
