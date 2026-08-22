import Link from "next/link";
import { currentPerson } from "@/lib/current-person";
import { canAdminister } from "@/lib/people";
import { handoffStore, peopleStore } from "@/lib/repo";
import { switchUser } from "@/app/actions";
import { PersonSwitcher } from "../person-switcher";
import { AlertBell } from "./alert-bell";
import { openFor } from "@/lib/handoff";
import { destinationFor } from "@/lib/destination";

/**
 * The working chrome. The landing page sits outside this group deliberately
 * — it is the front door, not a screen inside the product.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [people, current] = await Promise.all([peopleStore().signIns(), currentPerson()]);
  // Both classes are DERIVED — nothing is stored as a message, so there is
  // nothing to poll, nothing to mark read one by one, and nothing that can
  // disagree with the conversation it describes.
  const [waiting, news] = await Promise.all([
    handoffStore().waitingOn(current),
    handoffStore().newsFor(current),
  ]);
  const now = new Date();
  return (
    <>
      <header className="appbar">
        <div className="appbar-inner">
          <Link href="/projects" className="wordmark">
            Risk Assessment <span>Advisor</span>
          </Link>
          <span className="appbar-right">
            {canAdminister(current.role) && (
              <Link href="/admin/agents" className="appbar-link">
                Agents
              </Link>
            )}
            <AlertBell
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
            <PersonSwitcher people={people} current={current} />
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
