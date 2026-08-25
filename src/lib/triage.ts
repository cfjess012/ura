/**
 * Who a submitted assessment alerts.
 *
 * Every Risk Assessor, for the part they own — not one triage inbox.
 *
 * The pilot started by routing everything to one person, and the alert it
 * produced was a lie: it told an assessor four control answers were waiting
 * for them when every one belonged to another risk area. They opened the
 * queue, found each control greyed out, and the honest conclusion was that
 * the product was broken.
 *
 * Authority already answers this. FR-17 says an assessor signs for the risk
 * area they own, `control-domains.json` says which area owns which control
 * family, and `mayAttest` is the check. So the alert asks the same question
 * the screen does, and an assessor is told about an assessment exactly when
 * there is something on it they can act on. Nobody needs assigning, and no
 * queue can be routed to somebody who cannot work it.
 *
 * A generalist assessor (no risk area) covers everything, which is what
 * stops an answer sitting in a queue nobody reads.
 */
import type { Person } from "./people";

/** Does a submitted assessment alert this person at all? */
export function triagesSubmissions(person: Person): boolean {
  return person.role === "assessor" || person.role === "admin";
}
