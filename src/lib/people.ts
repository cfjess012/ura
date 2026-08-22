/**
 * Roles and authority (SPEC §2) — pure: no framework, no driver, no
 * environment, so the same rules run in a Lambda or an AgentCore task.
 *
 * Authority is decided here and checked server-side. The sign-in mechanism
 * is deliberately separate and replaceable: a pilot switcher today, single
 * sign-on later, with none of these rules moving.
 */

export const ROLES = ["requester", "assessor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type Person = {
  id: string;
  name: string;
  role: Role;
  title: string;
  email: string;
  /**
   * Whether this person can be chosen at the pilot sign-in. The directory
   * is bigger than the personas: most of it exists to be *picked* as an
   * owner, which is what an IdP lookup gives you on day one (G-46).
   */
  signsIn: boolean;
  /** The risk area this person owns, for assessors. Null for everyone else. */
  riskDomain: string | null;
  /** Everything said before this has been read (S4.7). */
  newsClearedAt: Date | null;
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** What each role is called where a person can see it. */
export const ROLE_LABEL: Record<Role, string> = {
  requester: "Requester",
  assessor: "Risk Assessor",
  admin: "Administrator",
};

/** One sentence a person could read about what their role may do. */
export const ROLE_SUMMARY: Record<Role, string> = {
  requester: "Describes the activity and answers the assessment.",
  assessor: "Reviews and attests each answer, disposes findings, packages the result.",
  admin: "Manages people and platform settings; sees the agent transparency page.",
};

/** Only a Risk Assessor or an administrator may attest an answer (§2, §5.5). */
export function canAttest(role: Role): boolean {
  return role === "assessor" || role === "admin";
}

/** Only an administrator sees platform administration surfaces. */
export function canAdminister(role: Role): boolean {
  return role === "admin";
}

/** A requester may answer their own assessment; assessors may correct. */
export function canAnswer(role: Role): boolean {
  return role === "requester" || role === "assessor" || role === "admin";
}

/**
 * Whose assessments a person may see (§2). A requester sees their own work;
 * a Risk Assessor and an administrator see everyone's, because triaging a
 * queue you cannot see is not a job.
 *
 * This was the F2 finding: every role saw every project, under a heading
 * that said "Your assessments".
 */
export function seesEveryAssessment(role: Role): boolean {
  return role === "assessor" || role === "admin";
}

/**
 * Whether this person may open a particular assessment (§2, N1).
 *
 * The list-scoping rule and the object-access rule must be the same rule,
 * or the product shows one thing and permits another — which is exactly
 * what independent verification found: every assessment was reachable by
 * URL from every persona while the list claimed to be scoped.
 *
 * An assessment with no recorded owner belongs to nobody, so only the roles
 * that see everything can open it. Those are pre-attribution pilot rows;
 * inventing an owner for them would be worse than leaving them closed.
 */
export function mayOpenAssessment(
  role: Role,
  personId: string,
  ownedBy: string | null,
): boolean {
  if (seesEveryAssessment(role)) return true;
  return ownedBy !== null && ownedBy === personId;
}

/**
 * Who may start an assessment (§2). A Risk Assessor reviews activities; they
 * do not own them, so the platform does not offer them a way to start one —
 * and refuses server-side if the form is reached anyway (§2: the UI is never
 * the enforcement point).
 */
export function canStartAssessment(role: Role): boolean {
  return role === "requester" || role === "admin";
}

/** Thrown when authority is missing — callers turn it into a Failure (§25). */
export class NotPermitted extends Error {
  constructor(action: string, role: Role) {
    super(`${ROLE_LABEL[role]} may not ${action}`);
  }
}
