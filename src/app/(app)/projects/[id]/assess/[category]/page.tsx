import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  askableCategories,
  categoryByKey,
  CATEGORIES,
  gateStates,
  unansweredCount,
} from "@/lib/instrument";
import { firstIncompleteSection } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { asksNothingFurther, STOPS_HERE } from "@/lib/severity";
import { openProject } from "@/lib/project-access";
import { NotYourAssessment } from "../../not-yours";
import { answerStore } from "@/lib/repo";
import { stageOf } from "@/lib/submission";
import { ProjectHeader } from "../../project-header";
import { GateForm } from "../gate-form";
import { GateRail } from "../gate-rail";

export const dynamic = "force-dynamic";

export default async function GatePage({
  params,
}: {
  params: Promise<{ id: string; category: string }>;
}) {
  const { id, category: key } = await params;
  const category = categoryByKey(key);
  if (!category) notFound();

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
  const state = states.find((s) => s.category.key === key)!;

  // Navigation walks only what a person is actually asked (C-8): a settled
  // area is shown in the rail and on the summary, never as a step to take.
  const askable = askableCategories();
  const index = askable.findIndex((c) => c.key === key);
  // A settled area is not IN the askable list, so `index` is -1 there and
  // both controls pointed backwards: "Next" restarted at area 1 and
  // "Previous" left the risk areas entirely. Reachable by link is the whole
  // point of a settled area (G-36), so it needs real neighbours — its own,
  // taken from the full ordering a person sees in the rail.
  const shown = CATEGORIES.findIndex((c) => c.key === key);
  const neighbour = (step: -1 | 1) => {
    for (let at = shown + step; at >= 0 && at < CATEGORIES.length; at += step) {
      const candidate = askable.find((c) => c.key === CATEGORIES[at]!.key);
      if (candidate) return candidate;
    }
    return undefined;
  };
  const next = index === -1 ? neighbour(1) : askable[index + 1];
  const previous = index === -1 ? neighbour(-1) : askable[index - 1];
  const nextHref = next
    ? `/projects/${id}/assess/${next.key}`
    : `/projects/${id}/assess/paths`;
  const remaining = unansweredCount(states);

  return (
    <main>
      <ProjectHeader
        name={project.projectName}
        status={stageOf(project.submittedAt)}
        nextLine={
          remaining === 0
            ? "Every risk area has an answer — the detail questions come next."
            : `Say whether each risk area applies — ${remaining} of ${askable.length} still to answer.`
        }
        currentStage={1}
      />

      <div className="assess-layout">
        <GateRail projectId={id} states={states} currentKey={key} />

        <section>
          <p className="eyebrow">
            {/* The rail numbers every area a person sees; this counted only
                the askable ones, so after Governance the two disagreed by
                one, six inches apart. One ordering, both places. */}
            {state.settled
              ? `Step 2 · Risk area ${shown + 1} of ${CATEGORIES.length} · not asked`
              : `Step 2 · Risk area ${shown + 1} of ${CATEGORIES.length}`}
          </p>
          <h2 className="display gate-display">{category.name}</h2>

          <div className="card gate-card">
            <p className="gate-question">{category.text}</p>
            <p className="help gate-help">{category.help}</p>

            {state.settled ? (
              /* Reachable by link, never by the journey (C-8). Saying "there
                 is no question here, and here is why" is the whole point of
                 removing it — a silent redirect would look like a bug. */
              <p className="prefill" role="note">
                <span className="prefill-tag">Nothing to answer</span>
                <span>
                  We&rsquo;ve recorded this as applying because {state.because}. A
                  reviewer covers it either way.
                </span>
              </p>
            ) : (
            <GateForm
              projectId={id}
              categoryKey={key}
              questionId={category.questionId}
              answer={state.answer}
              fromIntake={state.fromIntake}
              origin={state.origin}
              because={state.because}
              nextHref={nextHref}
              asksNothingFurther={asksNothingFurther(key)}
            />
            )}

            {/* Where the pilot stops, it says so (FR-35, G-50). Silence
                reads as completeness, and an area that applies but asks
                nothing is indistinguishable from one that is not built —
                which is a claim this product cannot afford. */}
            {state.answer === "Yes" && !state.settled && asksNothingFurther(key) && (
              <p className="prefill" role="note">
                <span className="prefill-tag">Nothing further here</span>
                <span>{STOPS_HERE}</span>
              </p>
            )}
          </div>

          <div className="gate-nav">
            {previous ? (
              <Link className="btn ghost" href={`/projects/${id}/assess/${previous.key}`}>
                ← Previous
              </Link>
            ) : (
              <Link className="btn ghost" href={`/projects/${id}`}>
                ← Back to intake
              </Link>
            )}
            <Link className="btn ghost" href={nextHref}>
              {state.settled || state.answer ? "Next →" : "Skip for now →"}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
