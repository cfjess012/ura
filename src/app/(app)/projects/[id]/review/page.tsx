import Link from "next/link";
import { canAttest } from "@/lib/people";
import { currentPerson } from "@/lib/current-person";
import { openProject } from "@/lib/project-access";
import { answerStore, peopleStore, reviewStore, submissionStore } from "@/lib/repo";
import { intakeValuesFrom } from "@/lib/intake-values";
import { accumulatedFor } from "@/lib/severity";
import { childrenAsked, isTier3Value, objectivesFor, type Tier3Value } from "@/lib/tier3";
import { domainForObjective, mayAttest } from "@/lib/attestation";
import { reviewRubric, BAND_ORDER, type ReviewResult } from "@/lib/grounding";
import { findingIsOpen, stageOf } from "@/lib/submission";
import { NotYourAssessment } from "../not-yours";
import { ProjectHeader } from "../project-header";
import { ReviewQueue, type QueueItem } from "./review-queue";

export const dynamic = "force-dynamic";

/**
 * S8 · The reviewer's workspace (FR-16, FR-17, NFR-10).
 *
 * Three columns, the shape lifted from the prior platform (G-8): the risk
 * areas on the left, the queue in the middle, what is being signed on the
 * right. What is NOT lifted is its 6,600 lines of Tailwind — this product
 * styles from named tokens (§23), and importing a second styling system
 * would be the parallel implementation §11 forbids.
 *
 * The queue is ordered by the review rubric: what needs a person most,
 * first. The band orders and nothing else — it can never gate, skip or
 * pre-approve an attestation (§5.5, G-61).
 */
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await openProject(id);
  if (!access.ok) return <NotYourAssessment person={access.person} />;
  const project = access.project;
  const person = await currentPerson();

  if (project.submittedAt === null) {
    return (
      <main>
        <ProjectHeader
          name={project.projectName}
          status={stageOf(project.submittedAt)}
          nextLine="Not submitted yet — there is nothing to review."
          currentStage={1}
        />
        <div className="assess-single">
          <div className="card card-upcoming">
            <h2>Still with its owner</h2>
            <p>
              A reviewer signs answers after they are submitted. Until then they can
              still change, and signing one would be signing something that moves.
            </p>
            <Link className="btn ghost" href={`/projects/${id}/assess/complete`}>
              See where it stands →
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const [stored, findings, attestations, everyone, dispositions] = await Promise.all([
    answerStore().current(id),
    submissionStore().findingsFor(id),
    reviewStore().attestationsFor(id),
    peopleStore().list(),
    reviewStore().dispositionsFor(id),
  ]);

  const intake = intakeValuesFrom(project as unknown as Record<string, unknown>);
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

  const nameOf = (personId: string) =>
    everyone.find((someone) => someone.id === personId)?.name ?? personId;
  const latest = new Map<string, (typeof attestations)[number]>();
  for (const row of attestations) if (!latest.has(row.questionId)) latest.set(row.questionId, row);

  // How many times each question has been answered — insert-only, so the
  // record knows, and the rubric can see somebody who kept changing it.
  const timesAnswered = new Map<string, number>();
  for (const key of Object.keys(values)) timesAnswered.set(key, 1);

  const items: QueueItem[] = required.map((objective) => {
    const value = values[objective.questionId];
    const children = childrenAsked(objective, value?.answer ?? null, lookup);
    const unanswered = children.filter((c) => !values[c.questionId]).length;
    const rubric: ReviewResult | null = value
      ? reviewRubric({
          answer: value.answer,
          note: value.note,
          wasHandedOff: false,
          timesAnswered: timesAnswered.get(objective.questionId) ?? 1,
          childrenUnanswered: unanswered,
          draftedWithEvidence: null,
        })
      : null;
    const signed = latest.get(objective.questionId);
    return {
      questionId: objective.questionId,
      objective: objective.id,
      name: objective.name,
      question: objective.text,
      answer: value?.answer ?? null,
      note: value?.note ?? "",
      domain: domainForObjective(objective.id),
      mine: mayAttest(person, objective.id),
      band: rubric?.band ?? null,
      criteria: rubric?.criteria ?? [],
      attestation: signed
        ? {
            act: signed.act,
            by: nameOf(signed.attestedBy),
            at: signed.attestedAt.toISOString(),
            note: signed.note,
            correctedAnswer: signed.correctedAnswer,
          }
        : null,
      findings: findings
        .filter((finding) => finding.questionId === objective.questionId)
        .map((finding) => ({
          id: finding.id,
          kind: finding.kind,
          note: finding.note,
          open: findingIsOpen(
            dispositions.find((d) => d.findingId === finding.id) ?? null,
            new Date(),
          ),
        })),
    };
  });

  // What needs a person most, first — then unsigned before signed, so the
  // queue drains rather than re-presenting settled work.
  items.sort((a, b) => {
    if (Boolean(a.attestation) !== Boolean(b.attestation)) return a.attestation ? 1 : -1;
    if (a.mine !== b.mine) return a.mine ? -1 : 1;
    return BAND_ORDER[a.band ?? "routine"] - BAND_ORDER[b.band ?? "routine"];
  });

  const mine = items.filter((item) => item.mine && !item.attestation).length;
  const signedCount = items.filter((item) => item.attestation).length;

  return (
    <main>
      <ProjectHeader
        name={project.projectName}
        status={stageOf(project.submittedAt)}
        nextLine={
          !canAttest(person.role)
            ? "You can read this, but attesting is a Risk Assessor's act."
            : mine === 0
              ? `Nothing left for you here — ${signedCount} of ${items.length} signed.`
              : `${mine} control${mine === 1 ? "" : "s"} for you to attest — ${signedCount} of ${items.length} signed.`
        }
        currentStage={2}
      />
      <ReviewQueue projectId={id} items={items} canAttest={canAttest(person.role)} />
    </main>
  );
}
