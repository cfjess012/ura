import Link from "next/link";
import { ROLE_LABEL, type Person } from "@/lib/people";

/**
 * Shown when a person opens an assessment that isn't theirs (§2, N1).
 *
 * It names who they are working as, because in a pilot the commonest cause
 * is a persona left switched — and a refusal that doesn't say why reads as
 * a broken link rather than a rule being enforced.
 */
export function NotYourAssessment({ person }: { person: Person }) {
  return (
    <main>
      <p className="eyebrow">Not your assessment</p>
      <h1 className="display">This one belongs to someone else</h1>
      <p className="lede">
        You&rsquo;re working as <strong>{person.name}</strong> (
        {ROLE_LABEL[person.role]}), and a requester sees only their own
        assessments. Nothing has been changed.
      </p>
      <div className="card recover">
        <h2>What to do</h2>
        <ol className="summary-list">
          <li>
            If this is your work, switch to the person who started it in the bar
            above.
          </li>
          <li>
            If it isn&rsquo;t, ask its owner to make the change — or ask a Risk
            Assessor, who sees every assessment.
          </li>
        </ol>
        <div className="savebar">
          <Link href="/projects" className="btn">
            Go to my assessments
          </Link>
        </div>
      </div>
    </main>
  );
}
