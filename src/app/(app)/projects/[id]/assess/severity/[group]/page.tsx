import { notFound, redirect } from "next/navigation";
import { CATEGORIES, gateStates } from "@/lib/instrument";
import { litPaths } from "@/lib/engine";
import { firstIncompleteSection } from "@/lib/intake";
import { intakeValuesFrom } from "@/lib/intake-values";
import { openProject } from "@/lib/project-access";
import { answerStore } from "@/lib/repo";
import {
  deriveBand,
  severityQuestionsFor,
  type Band,
  type SeverityQuestion,
} from "@/lib/severity";
import { NotYourAssessment } from "../../../not-yours";
import { stageOf } from "@/lib/submission";
import { ProjectHeader } from "../../../project-header";
import * as React from "react";
import { handoffStore, peopleStore } from "@/lib/repo";
import { mayResolve, recipientLabel } from "@/lib/handoff";
import type { HandoffView, Recipient } from "../handoff-panel";
import { FocusOnArrival } from "@/app/(app)/focus-on-arrival";
import { SeverityForm, type SeverityItem } from "../severity-form";
import { SeverityRail, groupKey, groupsFor } from "../severity-rail";

export const dynamic = "force-dynamic";

/**
 * Step 3 — how severe, one category at a time (§24.2).
 *
 * Which questions exist here is a function of the Tier-1 paths that are
 * lit, recomputed on every render. Close a gate upstream and these
 * questions stop being asked, with nothing to migrate (NFR-3).
 */
export default async function SeverityPage({
  params,
}: {
  params: Promise<{ id: string; group: string }>;
}) {
  const { id, group } = await params;

  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;

  const intake = intakeValuesFrom(project as unknown as Record<string, unknown>);
  const incomplete = firstIncompleteSection(intake);
  if (incomplete) redirect(`/projects/${id}/intake/${incomplete}?needed=1`);

  const stored = await answerStore().current(id);
  const gates = gateStates(stored, intake);
  if (gates.some((g) => g.answer === null)) {
    redirect(`/projects/${id}/assess/${gates.find((g) => g.answer === null)!.category.key}`);
  }

  const selections: Record<string, string[]> = {};
  for (const category of CATEGORIES) {
    const value = category.pathQuestion
      ? stored[category.pathQuestion.questionId]?.value
      : undefined;
    if (Array.isArray(value)) selections[category.key] = value;
  }
  const stillToNarrow = gates.some(
    (g) => g.answer === "Yes" && g.category.pathQuestion && selections[g.category.key] === undefined,
  );
  if (stillToNarrow) redirect(`/projects/${id}/assess/paths`);

  const lit = litPaths(CATEGORIES, gates, selections, intake);
  const asked = severityQuestionsFor(lit.map((p) => p.id));
  const groups = groupsFor(asked);
  const here = groups.find((g) => g.key === group);
  if (!here) notFound();

  const items: SeverityItem[] = here.questions.map((question: SeverityQuestion) => {
    const answer = stored[question.questionId]?.value;
    const detailAnswer = question.detail ? stored[question.detail.questionId]?.value : undefined;
    return {
      question,
      band: typeof answer === "string" ? (answer as Band) : null,
      detail: Array.isArray(detailAnswer) ? detailAnswer : [],
      derived: deriveBand(question, intake),
    };
  });

  // Hand-offs on the questions this screen shows, plus who they could go to.
  const [allHandoffs, everyone] = await Promise.all([
    handoffStore().forProject(id),
    peopleStore().list(),
  ]);
  const onThisScreen = allHandoffs.filter((h) =>
    here.questions.some(
      (q: SeverityQuestion) => q.questionId === h.questionId || q.detail?.questionId === h.questionId,
    ),
  );
  const replies = await handoffStore().repliesFor(onThisScreen.map((h) => h.id));
  const nameOf = (personId: string) =>
    everyone.find((person) => person.id === personId)?.name ?? "someone";
  const recipients: Recipient[] = [
    ...CATEGORIES.map((c) => ({ id: c.key, label: c.name, kind: "domain" as const })),
    ...everyone
      .filter((person) => person.role === "assessor")
      .map((person) => ({
        id: person.id,
        label: person.title ? `${person.name} — ${person.title}` : person.name,
        kind: "person" as const,
      })),
  ];
  // A map, not a function: a function cannot cross into a client component,
  // and the set of questions on this screen is already known.
  const handoffs: Record<string, HandoffView> = Object.fromEntries(
    onThisScreen.map((found) => [
      found.questionId,
      {
        id: found.id,
        toLabel: recipientLabel(
          found,
          nameOf,
          (key) => CATEGORIES.find((c) => c.key === key)?.name ?? "a risk area",
        ),
        note: found.note,
        askedByName: found.askedByName,
        askedByRole: found.askedByRole,
        createdAt: found.createdAt.toISOString(),
        resolvedAt: found.resolvedAt?.toISOString() ?? null,
        // The same fact the bell derives its obligation from (FR-36).
        answered: stored[found.questionId] !== undefined,
        resolvedByName: found.resolvedBy ? nameOf(found.resolvedBy) : null,
        mayResolve: mayResolve(found, access.person),
        replies: replies
          .filter((r) => r.handoffId === found.id)
          .map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      },
    ]),
  );

  const index = groups.findIndex((g) => g.key === group);
  const next = groups[index + 1];
  const answeredEverywhere = asked.filter((q) => stored[q.questionId]).length;
  // Progress is what is left for THIS person (§24.9). A question handed to
  // someone else is not theirs to answer, and counting it told a requester
  // "11 of 11 still to answer" when one was with the Third-Party office —
  // the same shape as the queue that once claimed "274 to attest"
  // (verifier finding 8).
  const withSomeoneElse = asked.filter(
    (q) => !stored[q.questionId] && allHandoffs.some((h) => h.resolvedAt === null && h.questionId === q.questionId),
  ).length;
  const theirs = asked.length - withSomeoneElse;

  return (
    <main>
      <ProjectHeader
        name={project.projectName}
        status={stageOf(project.submittedAt)}
        nextLine={
          answeredEverywhere === asked.length
            ? "Every severity question has an answer — the control questions come next."
            : `How severe — ${theirs - answeredEverywhere} of ${theirs} still to answer.${
                withSomeoneElse > 0
                  ? ` ${withSomeoneElse === 1 ? "One more is" : `${withSomeoneElse} more are`} with a risk assessor.`
                  : ""
              }`
        }
        currentStage={1}
      />

      <div className="assess-layout">
        <SeverityRail projectId={id} groups={groups} answered={stored} currentKey={group} />

        <section>
          <p className="eyebrow">
            Step 3 · {index + 1} of {groups.length}
          </p>
          <h2 className="display gate-display">{here.name}</h2>
          <p className="lede" style={{ textAlign: "left", margin: "0 0 1.2rem" }}>
            Pick the description that fits. They&rsquo;re written as facts you can
            check rather than judgements, so two people reading the same
            situation land in the same place.
          </p>

          <React.Suspense fallback={null}>
            <FocusOnArrival />
          </React.Suspense>
          <SeverityForm
            projectId={id}
            items={items}
            recipients={recipients}
            handoffs={handoffs}
            /* FR-11's ledger is the whole assessment, not this screen: the
               active paths and every severity so far, alongside what they
               require. Computed here and never stored (NFR-3). */
            ledger={{
              paths: lit.map((p) => ({
                name: p.name,
                because: p.source === "derived" ? p.because.join("; and ") : null,
              })),
              /* The lit paths, so the client can ask for the same question
                 set the server did — one definition of "what is asked". */
              litPathIds: lit.map((p) => p.id),
              /* Every band and every detail recorded across the assessment.
                 The first cut sent only the severities to display, so the
                 controls half of the ledger still accumulated from one
                 screen and disagreed with the summary. */
              bands: Object.fromEntries(
                asked
                  .map((q) => [q.questionId, stored[q.questionId]?.value])
                  .filter(([, v]) => typeof v === "string"),
              ) as Record<string, Band>,
              details: Object.fromEntries(
                asked
                  .filter((q) => q.detail)
                  .map((q) => [q.detail!.questionId, stored[q.detail!.questionId]?.value])
                  .filter(([, v]) => Array.isArray(v)),
              ) as Record<string, string[]>,
              totalAsked: asked.length,
            }}
            nextHref={
              next
                ? `/projects/${id}/assess/severity/${next.key}`
                : `/projects/${id}/assess/complete`
            }
            nextLabel={next ? `Next: ${next.name} →` : "See the summary →"}
          />
        </section>
      </div>
    </main>
  );
}
