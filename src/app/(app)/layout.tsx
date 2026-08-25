import Link from "next/link";
import { currentPerson } from "@/lib/current-person";
import { canAdminister, ROLE_LABEL } from "@/lib/people";
import { handoffStore, projectStore } from "@/lib/repo";
import { triagesSubmissions } from "@/lib/triage";
import { needsReviewer, reviewStanding } from "@/lib/review-standing";
import { mayAttest } from "@/lib/attestation";
import { OBJECTIVES } from "@/lib/tier3";
import { switchUser } from "@/app/actions";
import { AlertBell } from "./alert-bell";
import { agentTransport } from "@/lib/agent";
import { openFor } from "@/lib/handoff";
import { destinationFor } from "@/lib/destination";

/**
 * The working chrome. The landing page sits outside this group deliberately
 * — it is the front door, not a screen inside the product.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await currentPerson();
  // Both classes are DERIVED — nothing is stored as a message, so there is
  // nothing to poll, nothing to mark read one by one, and nothing that can
  // disagree with the conversation it describes.
  const [waiting, news, submitted] = await Promise.all([
    handoffStore().waitingOn(current),
    handoffStore().newsFor(current),
    // Every assessor, for the part they own (src/lib/triage.ts). A
    // requester pays nothing for this query.
    triagesSubmissions(current)
      ? projectStore().awaitingReview()
      : Promise.resolve([]),
  ]);
  // Derived like every other obligation: an assessment appears here while
  // it still needs a reviewer and stops appearing when it doesn't. There is
  // no alert row to write on submit and none to mark read afterwards.
  // Addressed to one person, so it counts what that person may sign.
  const mine = (questionId: string) => {
    const objective = OBJECTIVES.find((o) => o.questionId === questionId);
    return objective ? mayAttest(current, objective.id) : false;
  };
  // A finding belongs to whoever owns the control it was raised against —
  // the same authority that decides who signs it.
  const minesObjective = (objectiveId: string) =>
    mayAttest(current, objectiveId);
  const toReview = submitted
    .filter((p) => needsReviewer(p.counts, mine, minesObjective))
    .map((p) => ({
      projectId: p.id,
      projectName: p.projectName,
      requesterName: p.startedBy ?? "somebody",
      submittedAt: p.submittedAt.toISOString(),
      standing: reviewStanding(p.id, p.counts, mine, minesObjective),
    }));
  const now = new Date();
  return (
    <>
      <header className="appbar">
        <div className="appbar-inner">
          <Link href="/projects" className="wordmark">
            Front Door AI Risk <span>Advisor</span>
          </Link>
          <span className="appbar-right">
            {/* Whether the assistant is actually connected on this
                deployment. Read from the seam, so it cannot say one thing
                while another is true — and a link to the page that says
                exactly what it may see. */}
            {agentTransport().available && (
              <Link
                href="/admin/agents"
                className="appbar-ai"
                title="An assistant is connected — see what it may read"
              >
                <span aria-hidden="true" className="appbar-ai-dot" />
                Assistant on
              </Link>
            )}
            {canAdminister(current.role) && (
              <Link href="/admin/agents" className="appbar-link">
                Agents
              </Link>
            )}
            <AlertBell
              toReview={toReview}
              obligations={waiting.map((h) => ({
                handoffId: h.id,
                projectId: h.projectId,
                projectName: h.projectName,
                questionLabel: h.questionLabel,
                askedByName: h.askedByName,
                openFor: openFor(h, now),
                href:
                  destinationFor(h.projectId, h.questionId)?.href ??
                  `/projects/${h.projectId}`,
              }))}
              news={news.map((n) => ({
                ...n,
                createdAt: n.createdAt.toISOString(),
                href:
                  destinationFor(n.projectId, n.questionId)?.href ??
                  `/projects/${n.projectId}`,
              }))}
            />
            {/* Who you are, stated plainly — the owner's call, taken from the
                prior platform: a name and a role pill read faster than a
                dropdown, and switching is a deliberate act through the
                front door rather than something you can do by mis-clicking
                a select in the chrome. */}
            <span className="whoami">
              <span className="whoami-name">{current.name}</span>
              <span className="whoami-role">{ROLE_LABEL[current.role]}</span>
            </span>
            {/* The pilot equivalent of signing out: back to the front door. */}
            <form action={switchUser}>
              <button type="submit" className="appbar-leave">
                Switch user
              </button>
            </form>
          </span>
        </div>
      </header>
      {children}
    </>
  );
}
