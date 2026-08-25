/**
 * Who a submitted assessment lands on.
 *
 * Triage is an open decision — by risk domain, by business unit, by
 * round-robin, by workload — and none of those are settled. Rather than
 * guess at a rule and bury it across the codebase, the pilot names one
 * person, in one constant, with the decision written beside it.
 *
 * The alert itself is not a stand-in: it is derived from the record the
 * same way every other obligation is, so when triage is decided this file
 * changes and nothing else does.
 */

/**
 * The Risk Assessor every submission reaches in the pilot.
 *
 * Jesse Blau (a.ai). A real assessor with a real domain, not a fake
 * account — so the demo shows an assessor's own queue rather than an
 * administrative view nobody actually works in.
 */
export const TRIAGE_ASSESSOR = "a.ai";

/** Does a submitted assessment alert this person? */
export function triagesSubmissions(personId: string): boolean {
  return personId === TRIAGE_ASSESSOR;
}
