/**
 * "Leave this to us" — a question handed to a person or an office, and the
 * conversation that settles it (S4.7).
 *
 * Pure: no framework, no driver, no environment (§26.1).
 *
 * The load-bearing idea, taken from the prior platform's own notes: alerts
 * split into two honest classes. NEWS is a message — clearable, ages out.
 * An OBLIGATION is never stored as a message at all: it is derived from
 * state, so it cannot be dismissed while the work is undone and it vanishes
 * the moment the work is finished. A hand-off is an obligation.
 */
import type { Person } from "./people";

export type Handoff = {
  id: string;
  projectId: string;
  projectName: string;
  questionId: string;
  /** The question in its own words — never its id (NFR-9). */
  questionLabel: string;
  toPersonId: string | null;
  toDomain: string | null;
  note: string;
  askedBy: string;
  askedByName: string;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
};

export type Reply = {
  id: string;
  handoffId: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: Date;
};

/** A reply with the replies to it, nested. */
export type ThreadNode = Reply & { children: ThreadNode[] };

/**
 * Nest a flat list of replies into a conversation.
 *
 * Orphans — a reply whose parent is missing — are surfaced at the top
 * rather than dropped. Losing someone's words because a row is missing is
 * worse than showing them slightly out of place.
 */
export function thread(replies: Reply[]): ThreadNode[] {
  const nodes = new Map<string, ThreadNode>();
  for (const reply of replies) nodes.set(reply.id, { ...reply, children: [] });
  const roots: ThreadNode[] = [];
  for (const reply of replies) {
    const node = nodes.get(reply.id)!;
    const parent = reply.parentId ? nodes.get(reply.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** How deep a reply sits, capped so the conversation cannot become a staircase. */
export const MAX_DEPTH = 4;

export function depthOf(node: ThreadNode, depth = 0): number {
  return depth;
}

/**
 * Whether this hand-off is waiting on this person.
 *
 * A named hand-off waits on that person. An office hand-off waits on whoever
 * owns that risk area — and on the generalist, who covers what has no named
 * owner, so a question can never sit in a queue nobody reads.
 */
export type Assignment = Pick<Handoff, "toPersonId" | "toDomain" | "resolvedAt">;

export function isWaitingOn(handoff: Assignment, person: Person): boolean {
  if (handoff.resolvedAt !== null) return false;
  if (handoff.toPersonId) return handoff.toPersonId === person.id;
  if (person.role !== "assessor") return false;
  return person.riskDomain === handoff.toDomain || person.riskDomain === null;
}

/**
 * Who may resolve it, and it is deliberately narrow (owner call).
 *
 * Only the person it was handed to. Not the requester who asked — they
 * flagged it precisely because they could not settle it, and letting them
 * close it returns the question to the person who could not answer it.
 * Administrators are the escape hatch for a hand-off whose owner has left.
 */
export function mayResolve(handoff: Handoff, person: Person): boolean {
  if (handoff.resolvedAt !== null) return false;
  if (person.role === "admin") return true;
  return isWaitingOn(handoff, person);
}

/**
 * What stops a hand-off being resolved, if anything.
 *
 * Resolving requires the question to actually have an answer. Without this
 * "resolved" would mean "somebody clicked resolved", and the pinned alert —
 * whose whole promise is that it stays until the work is done — would be
 * dismissible after all, one step removed.
 */
export function resolutionProblem(
  handoff: Handoff,
  person: Person,
  questionIsAnswered: boolean,
): string | null {
  if (handoff.resolvedAt !== null) return "This was already settled.";
  if (!mayResolve(handoff, person))
    return "This was handed to someone else, so it isn't yours to close.";
  if (!questionIsAnswered)
    return "The question still has no answer. Answer it, and then this closes.";
  return null;
}

/** Who a hand-off went to, in words a person reads. */
export function recipientLabel(
  handoff: Handoff,
  personName: (id: string) => string,
  domainName: (key: string) => string,
): string {
  if (handoff.toPersonId) return personName(handoff.toPersonId);
  return handoff.toDomain ? domainName(handoff.toDomain) : "a risk assessor";
}

/** "just now" / "5m ago" / "3h ago" / "3d ago" — from the prior platform. */
export function timeAgo(when: Date, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - when.getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** How long it has been open, for a pinned alert that should feel its age. */
export function openFor(handoff: Handoff, now: Date): string {
  return timeAgo(handoff.createdAt, now).replace(" ago", "");
}
