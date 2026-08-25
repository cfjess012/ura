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

  const state = await packageState(id);
  if (isFailure(state)) {
    return (
      <main>
        <p className="eyebrow">Package</p>
        <h1 className="display">{state.message}</h1>
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
        currentStage={4}
      />

      <div className="assess-layout">
        <section>
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
              You are signed in as <strong>{person.name}</strong>. Anyone who
              can open this assessment can take the payload; recording a package
              is attributed to whoever does it, and a later export adds a record
              rather than replacing one.
            </p>
            <Link className="btn ghost" href={`/projects/${id}/report`}>
              Back to the handoff summary
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
