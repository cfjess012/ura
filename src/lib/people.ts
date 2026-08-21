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

export type Person = { id: string; name: string; role: Role; title: string };

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
