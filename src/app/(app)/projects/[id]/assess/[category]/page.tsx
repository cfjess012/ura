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
import { ProposedAnswer } from "../proposed-answer";
import { NotYourAssessment } from "../../not-yours";
import { answerStore, handoffStore, peopleStore } from "@/lib/repo";
import { mayResolve, recipientLabel } from "@/lib/handoff";
import {
  HandoffPanel,
  type HandoffView,
  type Recipient,
} from "../severity/handoff-panel";
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

  const intake = intakeValuesFrom(
    project as unknown as Record<string, unknown>,
  );
  // The risk areas reason from the identity record, so an incomplete one is
  // not a cosmetic problem: nothing pre-fills and the person is asked
  // everything. Enforced here rather than only in the form, because the UI
  // is never the enforcement point (FR-28, §2).
  const incomplete = firstIncompleteSection(intake);
  if (incomplete) redirect(`/projects/${id}/intake/${incomplete}?needed=1`);
  const stored = await answerStore().current(id);

  // Who this gate could be handed to, and whether it already has been.
  const [allHandoffs, everyone] = await Promise.all([
    handoffStore().forProject(id),
    peopleStore().list(),
  ]);
  const nameOf = (personId: string) =>
    everyone.find((person) => person.id === personId)?.name ?? "someone";
  const recipients: Recipient[] = [
    ...CATEGORIES.map((c) => ({
      id: c.key,
      label: c.name,
      kind: "domain" as const,
    })),
    ...everyone
      .filter((person) => person.role === "assessor")
      .map((person) => ({
        id: person.id,
        label: person.title ? `${person.name} — ${person.title}` : person.name,
        kind: "person" as const,
      })),
  ];
  const found = allHandoffs.find((h) => h.questionId === category.questionId);
  const replies = found ? await handoffStore().repliesFor([found.id]) : [];
  const handoff: HandoffView | null = found
    ? {
        id: found.id,
        toLabel: recipientLabel(
          found,
          nameOf,
          (areaKey) =>
            CATEGORIES.find((c) => c.key === areaKey)?.name ?? "a risk area",
        ),
        note: found.note,
        askedByName: found.askedByName,
        askedByRole: found.askedByRole,
        createdAt: found.createdAt.toISOString(),
        resolvedAt: found.resolvedAt?.toISOString() ?? null,
        answered: stored[found.questionId] !== undefined,
        resolvedByName: found.resolvedBy ? nameOf(found.resolvedBy) : null,
        mayResolve: mayResolve(found, access.person),
        replies: replies.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
      }
    : null;
  const states = gateStates(stored, intake);
  const state = states.find((s) => s.category.key === key)!;
  // A proposal is only a proposal while nobody has answered: the moment a
  // person answers, theirs is the newest row and this is gone.
  const candidate = stored[state.category.questionId];
  const proposed =
    candidate &&
    candidate.source === "drafted" &&
    !candidate.confirmed &&
    // Never offer "Accept <a sentence>". A value that is not one of the
    // answers this question offers is not a proposal, it is noise — and it
    // used to close a whole risk area, because anything not "Yes" reads as
    // "No" downstream.
    (candidate.value === "Yes" || candidate.value === "No")
      ? candidate
      : null;

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
              ? "Step 2 · Applies to every assessment · not asked"
              : `Step 2 · Risk area ${index + 1} of ${askable.length}`}
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
                  We&rsquo;ve recorded this as applying because {state.because}.
                  A reviewer covers it either way.
                </span>
              </p>
            ) : (
              <>
                {/* A proposal is shown above the question, never inside it —
                the answer buttons stay the person's own act. */}
                {proposed && (
                  <ProposedAnswer
                    projectId={id}
                    questionId={category.questionId}
                    value={String(proposed.value)}
                    quote={proposed.sourceQuote ?? ""}
                    source={proposed.sourceRef ?? "the document you added"}
                    basis={proposed.basis ?? "stated"}
                  />
                )}
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
                {/*
                  The way out for a gate somebody genuinely cannot answer.
                  This existed on the severity questions and not here, which
                  is backwards: the gates come first, they are where an
                  unfamiliar area is met cold, and "does Legal & Regulatory
                  apply" is exactly the question a requester is least placed
                  to answer alone. Not an answer, and never recorded as one
                  — the record says the question moved to someone else.
                */}
                <HandoffPanel
                  projectId={id}
                  questionId={category.questionId}
                  recipients={recipients}
                  existing={handoff}
                />
              </>
            )}

            {/* Where the pilot stops, it says so (FR-35, G-50). Silence
                reads as completeness, and an area that applies but asks
                nothing is indistinguishable from one that is not built —
                which is a claim this product cannot afford. */}
            {state.answer === "Yes" &&
              !state.settled &&
              asksNothingFurther(key) && (
                <p className="prefill" role="note">
                  <span className="prefill-tag">Nothing further here</span>
                  <span>{STOPS_HERE}</span>
                </p>
              )}
          </div>

          <div className="gate-nav">
            {previous ? (
              <Link
                className="btn ghost"
                href={`/projects/${id}/assess/${previous.key}`}
              >
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
