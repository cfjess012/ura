import Link from "next/link";
import { redirect } from "next/navigation";
import { CATEGORIES, gateStates } from "@/lib/instrument";
import { litPaths } from "@/lib/engine";
import { questionLabelFor } from "@/lib/question-label";
import { firstIncompleteSection } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { openProject } from "@/lib/project-access";
import { answerStore, handoffStore, peopleStore, submissionStore } from "@/lib/repo";
import { accumulatedFor, severityQuestionsFor } from "@/lib/severity";
import { objectivesFor, isTier3Value, type Tier3Value } from "@/lib/tier3";
import { declarableFrom, earlierGaps, gapsIn, stageOf, synthesiseFindings } from "@/lib/submission";
import { NotYourAssessment } from "../not-yours";
import { ProjectHeader } from "../project-header";
import { SubmitForm } from "./submit-form";

export const dynamic = "force-dynamic";

/**
 * S7 · The declaration gateway (FR-14, FR-37).
 *
 * The last thing a requester does, and the only screen where they are asked
 * to stand behind what they wrote. Two things are shown plainly: the
 * answers they are declaring accurate, and — if any — the questions still
 * unanswered, by name.
 */
export default async function SubmitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;

  const intake = intakeValuesFrom(project as unknown as Record<string, unknown>);
  const incomplete = firstIncompleteSection(intake);
  if (incomplete) redirect(`/projects/${id}/intake/${incomplete}?needed=1`);

  const stored = await answerStore().current(id);
  const required = objectivesFor(accumulatedFor(stored, intake).map((c) => c.objective));
  const values: Record<string, Tier3Value> = {};
  for (const [questionId, value] of Object.entries(stored)) {
    if (questionId.startsWith("t3.") && isTier3Value(value.value)) values[questionId] = value.value;
  }
  const lookup: Record<string, string | string[]> = {};
  const paths: string[] = [];
  for (const [questionId, value] of Object.entries(stored)) {
    if (typeof value.value === "string" || Array.isArray(value.value)) lookup[questionId] = value.value;
    if (questionId.startsWith("path.") && Array.isArray(value.value)) paths.push(...value.value);
  }
  lookup.paths = paths;

  const declarable = declarableFrom(project as unknown as Record<string, unknown>);
  // The same earlier-tier gaps the action counts, so the screen and the
  // server cannot disagree about what is missing (verifier B1).
  const gates = gateStates(stored, intake);
  const selections: Record<string, string[]> = {};
  for (const category of CATEGORIES) {
    const value = category.pathQuestion ? stored[category.pathQuestion.questionId]?.value : undefined;
    if (Array.isArray(value)) selections[category.key] = value as string[];
  }
  const lit = litPaths(CATEGORIES, gates, selections, intake);
  const severityQuestions = severityQuestionsFor(lit.map((path) => path.id));
  const openHandoffs = (await handoffStore().forProject(id)).filter((h) => h.resolvedAt === null);
  const earlier = earlierGaps({
    gates: gates.map((g) => ({ category: g.category, answer: g.answer, settled: g.settled })),
    severity: severityQuestions.map((question) => ({
      questionId: question.questionId,
      name: question.name,
      text: question.text,
      answered: stored[question.questionId] !== undefined,
    })),
    handedOff: openHandoffs.map((h) => ({
      questionId: h.questionId,
      label: `${questionLabelFor(h.questionId)} — with a risk assessor`,
    })),
  });
  const gaps = gapsIn(required, values, lookup, earlier);
  const willRaise = synthesiseFindings(required, values, lookup);
  const submitted = project.submittedAt !== null;

  if (submitted) {
    const [declaration, findings, everyone] = await Promise.all([
      submissionStore().declarationFor(id),
      submissionStore().findingsFor(id),
      peopleStore().list(),
    ]);
    // A person, not an id (NFR-9). "Declared accurate by p.requester" put
    // an internal identifier on the one screen whose whole point is that a
    // named person stands behind the record.
    const declaredBy =
      everyone.find((someone) => someone.id === declaration?.declaredBy)?.name ?? "the submitter";
    return (
      <main>
        <ProjectHeader
          name={project.projectName}
          status={stageOf(project.submittedAt)}
          nextLine="Submitted. A Risk Assessor picks this up from here."
          currentStage={3}
        />
        <div className="assess-single">
          <section>
            <p className="eyebrow">Step 5 · Submitted</p>
            <h2 className="display">With a reviewer</h2>
            <p className="lede" style={{ textAlign: "left", margin: "0 0 1.2rem" }}>
              Declared accurate by {declaredBy} on{" "}
              {declaration?.declaredAt.toLocaleDateString() ?? "submission"}. Nothing here
              can be changed now — an answer edited after the declaration would make it
              describe a record that no longer exists.
            </p>

            {findings.length > 0 ? (
              <div className="card owed">
                <h2>
                  {findings.length} finding{findings.length === 1 ? "" : "s"} for the reviewer
                </h2>
                <p className="help">
                  Raised from the control answers. Each carries what was written about it.
                </p>
                <ul className="summary-list">
                  {findings.map((finding) => (
                    <li key={finding.id}>
                      <strong>{finding.objectiveName}</strong>
                      <span className={`band-tag band-${finding.kind === "gap" ? "high" : "medium"}`}>
                        {finding.kind === "gap" ? "Gap" : "Enhancement"}
                      </span>
                      <span className="meta"> — {finding.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              /* Two different facts, and this said the wrong one: an
                 assessment where NOTHING was answered read "every control
                 was answered as already in place" — attributing to a person
                 an answer they never gave, on the screen whose whole point
                 is standing behind the record (G-42, verifier B1). */
              <div className="card">
                <h2>No findings</h2>
                <p className="help">
                  {(declaration?.gaps.length ?? 0) > 0
                    ? "Nothing here was answered in a way that raises a finding. The unanswered questions below are what a reviewer picks up."
                    : "Every control this activity requires was answered as already in place. A reviewer still checks that, but there is nothing outstanding to fix."}
                </p>
              </div>
            )}

            {(declaration?.gaps.length ?? 0) > 0 && (
              <div className="card">
                <h2>Submitted with {declaration!.gaps.length} unanswered</h2>
                <p className="help">
                  Named and confirmed at submission, so a reviewer sees them exactly as
                  they were.
                </p>
                <ul className="summary-list">
                  {declaration!.gaps.map((gap) => (
                    <li key={gap.questionId}>{gap.label}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="rail-back" style={{ marginTop: "1rem" }}>
              <Link className="rail-back-link" href={`/projects/${id}/assess/complete`}>
                ← See the whole assessment
              </Link>
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main>
      <ProjectHeader
        name={project.projectName}
        status={stageOf(project.submittedAt)}
        nextLine={
          gaps.length === 0
            ? "Read your answers, declare them accurate, and hand this to a reviewer."
            : `${gaps.length} question${gaps.length === 1 ? "" : "s"} unanswered — you can still submit, but you confirm the list.`
        }
        currentStage={2}
      />
      <div className="assess-single">
        <section>
          <p className="eyebrow">Step 5 · Submit</p>
          <h2 className="display">Declare and hand over</h2>
          <p className="lede" style={{ textAlign: "left", margin: "0 0 1.2rem" }}>
            A reviewer works from what you have written, so this is the moment to
            say it is right. Submitting is one-way: after this the assessment is
            theirs and you cannot change your answers.
          </p>

          <SubmitForm
            projectId={id}
            declarable={declarable}
            gaps={gaps}
            willRaise={willRaise.length}
            nextHref={`/projects/${id}/submit`}
          />
        </section>
      </div>
    </main>
  );
}
