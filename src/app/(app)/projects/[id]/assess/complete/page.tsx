import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CATEGORIES,
  askableCategories,
  gateStates,
  gateProgressHeadline,
  unansweredCount,
} from "@/lib/instrument";
import { litPaths } from "@/lib/engine";
import {
  accumulateControls,
  asksNothingFurther,
  severityQuestionsFor,
  type Band,
} from "@/lib/severity";
import { groupsFor } from "../severity/severity-rail";
import { firstIncompleteSection } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { openProject } from "@/lib/project-access";
import { NotYourAssessment } from "../../not-yours";
import { answerStore } from "@/lib/repo";
import { ProjectHeader } from "../../project-header";
import { GateRail } from "../gate-rail";

export const dynamic = "force-dynamic";

export default async function GatesCompletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Authority is checked on the object, not only on the listing (N1).
  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;

  const intake = intakeValuesFrom(project as unknown as Record<string, unknown>);
  // The risk areas reason from the identity record, so an incomplete one is
  // not a cosmetic problem: nothing pre-fills and the person is asked
  // everything. Enforced here rather than only in the form, because the UI
  // is never the enforcement point (FR-28, §2).
  const incomplete = firstIncompleteSection(intake);
  if (incomplete) redirect(`/projects/${id}/intake/${incomplete}?needed=1`);
  const stored = await answerStore().current(id);
  const states = gateStates(stored, intake);
  const remaining = unansweredCount(states);
  const applies = states.filter((s) => s.answer === "Yes");
  const closed = states.filter((s) => s.answer === "No");
  // "Applies" meant two different things and said one (FR-35, G-50): an area
  // that opens twelve questions and one that opens none read identically.
  // Counted apart so the number cannot imply work that does not exist.
  const deep = applies.filter((s) => !asksNothingFurther(s.category.key));
  const quiet = applies.filter((s) => asksNothingFurther(s.category.key));
  // Progress is measured against what a person is asked (§24.9): counting
  // an area nobody was asked about as "answered" would flatter the number.
  const asked = askableCategories();
  const settled = states.filter((s) => s.settled);
  // Recomputed here, never read from a stored "derived" column (NFR-3).
  const selections: Record<string, string[]> = {};
  for (const category of CATEGORIES) {
    const value = category.pathQuestion
      ? stored[category.pathQuestion.questionId]?.value
      : undefined;
    if (Array.isArray(value)) selections[category.key] = value;
  }
  const lit = litPaths(CATEGORIES, states, selections, intake);
  // Recomputed from the answers, never stored (NFR-3). Change a severity
  // upstream and the workplan below changes with it.
  const severityQuestions = severityQuestionsFor(lit.map((p) => p.id));
  const bands: Record<string, Band | undefined> = {};
  const detailAnswers: Record<string, string[] | undefined> = {};
  for (const q of severityQuestions) {
    const value = stored[q.questionId]?.value;
    if (typeof value === "string") bands[q.questionId] = value as Band;
    if (q.detail) {
      const detail = stored[q.detail.questionId]?.value;
      if (Array.isArray(detail)) detailAnswers[q.detail.questionId] = detail;
    }
  }
  const owed = accumulateControls(severityQuestions, bands, detailAnswers);
  const severityAnswered = severityQuestions.filter((q) => bands[q.questionId]).length;
  const severityGroupKey = groupsFor(severityQuestions)[0]?.key ?? "";
  // Did anyone actually answer a path question? Distinct from "no paths are
  // lit", which is also true when nobody was ever asked.
  const answeredPaths = Object.keys(selections).length > 0;
  const pathsPending = states.some(
    (s) =>
      s.answer === "Yes" &&
      s.category.pathQuestion &&
      selections[s.category.key] === undefined,
  );

  return (
    <main>
      <ProjectHeader
        name={project.projectName}
        status="Draft"
        nextLine={
          remaining === 0
            ? "Every risk area has an answer — the detail questions come next."
            : remaining === 1
              ? "One risk area still needs an answer."
              : `${remaining} risk areas still need an answer.`
        }
        currentStage={1}
      />

      <div className="assess-layout">
        <GateRail projectId={id} states={states} currentKey="" />

        <section>
          <p className="eyebrow">Where this assessment stands</p>
          <h2 className="display">
            {gateProgressHeadline(asked.length - remaining, asked.length)}
          </h2>
          <p className="lede">
            {remaining === 0
              ? `${deep.length} of the ${applies.length} areas that apply open detailed questions.${quiet.length > 0 ? ` The other ${quiet.length} are recorded for a reviewer and ask nothing further.` : ""}${closed.length > 0 ? ` ${closed.length === 1 ? "One is" : `${closed.length} are`} closed — you won't be asked about ${closed.length === 1 ? "it" : "them"} again.` : ""}`
              : `Answer the remaining ${remaining} in the list, and we'll know which areas to ask about.`}
          </p>

          {lit.length === 0 && !pathsPending && (
            <div className="card">
              <h2>What we&rsquo;ll ask about</h2>
              <p className="help">
                {/* Two different facts, and the earlier version stated the
                    wrong one: "you told us none apply" was printed to people
                    who had never been asked anything. */}
                {answeredPaths
                  ? "Nothing further. You told us none of the specific threads apply in the areas that are open, so the detailed questions have nothing to ask — that is a complete answer, not a gap."
                  : "Nothing further. None of the areas that apply here ask a follow-up question, so there was nothing to narrow down."}
              </p>
            </div>
          )}

          {lit.length > 0 && (
            <div className="card">
              <h2>What we&rsquo;ll ask about</h2>
              <ul className="summary-list">
                {lit.map((path) => (
                  <li key={`${path.categoryKey}.${path.id}`}>
                    <strong>{path.name}</strong>
                    {path.source === "derived" && path.because.length > 0 && (
                      <span className="meta">
                        {" "}
                        — added because {path.because.join("; and ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="help" style={{ marginTop: ".6rem" }}>
                {lit.filter((p) => p.source === "derived").length} of these were
                worked out from answers you already gave.
              </p>
            </div>
          )}

          {owed.length > 0 && (
            <div className="card owed">
              <h2>What this assessment requires</h2>
              <p className="help">
                Assembled from your severity answers — each control names the
                answer that pulled it in. The detailed questions inside each
                control come later; this is the workplan they will follow.
              </p>
              <ul className="summary-list">
                {owed.map((control) => (
                  <li key={control.objective}>
                    <strong>{control.name}</strong>
                    <span className="meta"> — {control.because.join("; and ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {severityQuestions.length > 0 && severityAnswered < severityQuestions.length && (
            <div className="card card-upcoming">
              <h2>Still to answer</h2>
              <p>
                {severityQuestions.length - severityAnswered} severity question
                {severityQuestions.length - severityAnswered === 1 ? "" : "s"} have no
                answer yet
                {owed.length > 0
                  ? ", so the list above is incomplete."
                  : ", so we can't yet say what this activity will require."}
              </p>
              <Link className="btn" href={`/projects/${id}/assess/severity/${severityGroupKey}`}>
                Answer them &rarr;
              </Link>
            </div>
          )}

          {pathsPending && (
            <div className="card card-upcoming">
              <h2>Still to narrow down</h2>
              <p>
                Some open areas haven&rsquo;t been narrowed yet, so we don&rsquo;t
                know which parts of them to ask about.
              </p>
              <Link className="btn" href={`/projects/${id}/assess/paths`}>
                Narrow them down →
              </Link>
            </div>
          )}

          <div className="card">
            <h2>Applies to this activity</h2>
            {applies.length === 0 ? (
              <p className="help">Nothing yet.</p>
            ) : (
              <ul className="summary-list">
                {applies.map((s) => (
                  <li key={s.category.key}>
                    <strong>{s.category.name}</strong>
                    {asksNothingFurther(s.category.key) && !s.settled && (
                      <span className="meta"> — recorded for a reviewer; nothing further is asked here</span>
                    )}
                    {s.settled && s.because && (
                      <span className="meta"> — {s.because}</span>
                    )}
                    {s.fromIntake && s.because && (
                      <span className="meta">
                        {" — answered from "}
                        {s.origin === "answers" ? "your answers" : "your intake"}
                        {" because "}
                        {s.because}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {closed.length > 0 && (
            <div className="card">
              <h2>Closed — not applicable</h2>
              <ul className="summary-list closed">
                {closed.map((s) => (
                  <li key={s.category.key}>{s.category.name}</li>
                ))}
              </ul>
            </div>
          )}

          {/*
            Honest about what does not exist yet (§24.8) — and honest in the
            other direction too. This card used to say the severity screens
            "are still being built" to a person who had just finished them,
            which is the same defect as claiming an unbuilt stage is ready
            (S4 verification, F3).
          */}
          <div className="card card-upcoming">
            <h2>Coming next</h2>
            <p>
              A reviewer picks this up, and the detailed control questions
              behind each requirement above are asked. Those screens are still
              being built — everything you have answered is saved.
            </p>
            <Link className="btn ghost" href={`/projects/${id}`}>
              Back to the assessment
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
