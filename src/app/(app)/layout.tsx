import Link from "next/link";
import { currentPerson } from "@/lib/current-person";
import { canAdminister } from "@/lib/people";
import { peopleStore } from "@/lib/repo";
import { PersonSwitcher } from "../person-switcher";

/**
 * The working chrome. The landing page sits outside this group deliberately
 * — it is the front door, not a screen inside the product.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [people, current] = await Promise.all([peopleStore().list(), currentPerson()]);
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
            <PersonSwitcher people={people} current={current} />
          </span>
        </div>
      </header>
      {children}
    </>
  );
}
