import Link from "next/link";
import { redirect } from "next/navigation";
import { CATEGORIES, gateStates } from "@/lib/instrument";
import { litPaths } from "@/lib/engine";
import { accumulatedFor, severityQuestionsFor, controlName, type Band } from "@/lib/severity";
import { objectivesFor, withoutQuestions, isTier3Value, type Tier3Value } from "@/lib/tier3";
import { firstIncompleteSection } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { openProject } from "@/lib/project-access";
import { answerStore } from "@/lib/repo";
import { NotYourAssessment } from "../../not-yours";
import { stageOf } from "@/lib/submission";
import { ProjectHeader } from "../../project-header";
import { groupsFor } from "../severity/severity-rail";
import { ObjectivesForm } from "./objectives-form";

export const dynamic = "force-dynamic";

/**
 * Tier 3 — does the control actually exist? (S6, FR-12, FR-13)
 *
 * Everything before this works out what the activity REQUIRES. This screen
 * is the only one that asks whether the requirement is met, and its answers
 * are what findings are synthesised from at submit (§4.3).
 *
 * Which objectives appear is derived on every render from the severity
 * answers, never stored (NFR-3): change a band and this changes with it.
 */
export default async function ObjectivesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;

  const intake = intakeValuesFrom(project as unknown as Record<string, unknown>);
  const incomplete = firstIncompleteSection(intake);
  if (incomplete) redirect(`/projects/${id}/intake/${incomplete}?needed=1`);

  const stored = await answerStore().current(id);
  const gates = gateStates(stored, intake);
  const selections: Record<string, string[]> = {};
  for (const category of CATEGORIES) {
    const value = category.pathQuestion
      ? stored[category.pathQuestion.questionId]?.value
      : undefined;
    if (Array.isArray(value)) selections[category.key] = value;
  }
  const lit = litPaths(CATEGORIES, gates, selections, intake);
  const severityQuestions = severityQuestionsFor(lit.map((p) => p.id));
  const bands: Record<string, Band | undefined> = {};
  for (const question of severityQuestions) {
    const value = stored[question.questionId]?.value;
    if (typeof value === "string") bands[question.questionId] = value as Band;
  }
  // The same derivation the action authorises against — one definition, so
  // the screen and the server can never disagree about what is asked.
  const owed = accumulatedFor(stored, intake);
  const askable = objectivesFor(owed.map((c) => c.objective));
  const recorded = withoutQuestions(owed.map((c) => c.objective));
  const reasonFor = new Map(owed.map((c) => [c.objective, c.because]));

  // The severity answers this screen depends on. Nothing to ask about until
  // some exist — and saying so beats an empty screen (§24.4).
  const answeredSeverity = severityQuestions.filter((q) => bands[q.questionId]).length;
  const firstSeverityGroup = groupsFor(severityQuestions)[0]?.key ?? "";

  const values: Record<string, Tier3Value> = {};
  for (const [questionId, value] of Object.entries(stored)) {
    if (questionId.startsWith("t3.") && isTier3Value(value.value)) {
      values[questionId] = value.value;
    }
  }
  const answered = askable.filter((o) => values[o.questionId]).length;

  const lookup: Record<string, string | string[]> = {};
  const paths: string[] = [];
  for (const [questionId, value] of Object.entries(stored)) {
    // Only strings and lists can satisfy a condition (§3.2.3); an object
    // answer is evidence of something else and matches nothing.
    if (typeof value.value === "string" || Array.isArray(value.value)) {
      lookup[questionId] = value.value;
    }
    if (questionId.startsWith("path.") && Array.isArray(value.value)) paths.push(...value.value);
  }
  lookup.paths = paths;

  return (
    <main>
      <ProjectHeader
        name={project.projectName}
        status={stageOf(project.submittedAt)}
        nextLine={
          askable.length === 0
            ? "Nothing to answer here yet — the severity questions decide what this asks."
            : answered === askable.length
              ? "Every control has an answer — submission comes next."
              : `Do the controls exist — ${askable.length - answered} of ${askable.length} still to answer.`
        }
        currentStage={1}
      />

      <div className="assess-single">
        <section>
          <p className="eyebrow">Step 4 · Do the controls exist</p>
          <h2 className="display">What this activity requires</h2>
          <p className="lede" style={{ textAlign: "left", margin: "0 0 1.2rem" }}>
            Everything you have answered so far worked out what this activity
            needs. These questions ask whether it is already there. Answer
            honestly — a gap named here is a finding a reviewer can act on, and a
            gap found later is a surprise.
          </p>

          {answeredSeverity === 0 ? (
            <div className="card card-upcoming">
              <h2>Nothing to ask yet</h2>
              <p>
                What this asks about is worked out from the severity answers, and
                none are given yet. Answer those and the controls they require
                appear here.
              </p>
              <Link className="btn" href={`/projects/${id}/assess/complete`}>
                Back to where this stands →
              </Link>
            </div>
          ) : askable.length === 0 ? (
            /* Severity is answered but nothing crossed a threshold. The
               "nothing to ask yet" card above is the wrong sentence here —
               this is a finished state, not a waiting one (§23). */
            <div className="card">
              <h2>Nothing further to answer</h2>
              <p className="help">
                {owed.length === 0
                  ? "The answers so far require no controls, so there is nothing to check here. That is a complete answer, not a gap."
                  : `The ${owed.length} control${owed.length === 1 ? "" : "s"} this activity requires ${owed.length === 1 ? "is" : "are"} recorded for a reviewer — the pilot has no detailed questions for ${owed.length === 1 ? "it" : "them"} yet.`}
              </p>
              <Link className="btn" href={`/projects/${id}/assess/complete`}>
                See where this stands &rarr;
              </Link>
            </div>
          ) : (
            <ObjectivesForm
              projectId={id}
              objectives={askable}
              values={values}
              lookup={lookup}
              reasons={Object.fromEntries(askable.map((o) => [o.id, reasonFor.get(o.id) ?? []]))}
              nextHref={`/projects/${id}/assess/complete`}
            />
          )}

          {/* Not a dead end: every other assess screen offers a way back, and
              this one offered only Save (verifier S6-4). */}
          <p className="rail-back" style={{ marginTop: "1rem" }}>
            <Link className="rail-back-link" href={`/projects/${id}/assess/severity/${firstSeverityGroup}`}>
              ← Back to the severity questions
            </Link>
            <Link className="rail-back-link" href={`/projects/${id}/assess/complete`}>
              Where this assessment stands
            </Link>
          </p>

          {recorded.length > 0 && (
            /* Where the pilot stops, it says so (FR-35's rule, one tier down).
               These controls are required and will be reviewed; the pilot
               simply has no questions for them yet, and silence would read
               as "nothing to do". */
            <div className="card">
              <h2>Recorded for a reviewer</h2>
              <p className="help">
                This activity requires {recorded.length} more control
                {recorded.length === 1 ? "" : "s"}. The pilot asks its detailed
                questions for {askable.length} of the {owed.length} it works out —
                the rest are recorded and go to a reviewer as they are.
              </p>
              <ul className="summary-list">
                {recorded.map((objective) => (
                  <li key={objective}>
                    <strong>{controlName(objective)}</strong>
                    <span className="meta"> — {(reasonFor.get(objective) ?? []).join("; and ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
