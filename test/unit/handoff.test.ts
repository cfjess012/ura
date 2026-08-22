/**
 * S4.7 — "leave this to us" (FR-35..FR-37).
 *
 * The rules that decide who a question is waiting on, who may close it, and
 * what "closed" is allowed to mean. All pure, so none of it needs a browser.
 */
import { describe, expect, it } from "vitest";
import {
  isWaitingOn,
  mayResolve,
  recipientLabel,
  resolutionProblem,
  thread,
  timeAgo,
  type Handoff,
  type Reply,
} from "../../src/lib/handoff";
import type { Person } from "../../src/lib/people";

const person = (over: Partial<Person>): Person => ({
  id: "p.x",
  name: "X",
  role: "assessor",
  title: "",
  email: "",
  signsIn: true,
  riskDomain: null,
  newsClearedAt: null,
  ...over,
});

const handoff = (over: Partial<Handoff> = {}): Handoff => ({
  id: "h1",
  projectId: "p1",
  projectName: "Cadenza",
  questionId: "sev.tpr_4p_2",
  questionLabel: "Subcontractor Chain Transparency",
  toPersonId: null,
  toDomain: "third-party",
  note: "",
  askedBy: "p.requester",
  askedByName: "Priya Sharma",
  createdAt: new Date("2026-08-22T00:00:00Z"),
  resolvedAt: null,
  resolvedBy: null,
  ...over,
});

describe("who a question is waiting on", () => {
  it("an office hand-off waits on whoever owns that risk area", () => {
    expect(isWaitingOn(handoff(), person({ riskDomain: "third-party" }))).toBe(true);
    expect(isWaitingOn(handoff(), person({ riskDomain: "data-privacy" }))).toBe(false);
  });

  it("it also waits on the generalist, so nothing sits in a queue nobody reads", () => {
    expect(isWaitingOn(handoff(), person({ id: "p.assessor", riskDomain: null }))).toBe(true);
  });

  it("a named hand-off waits on that person and nobody else", () => {
    const named = handoff({ toPersonId: "a.privacy", toDomain: null });
    expect(isWaitingOn(named, person({ id: "a.privacy" }))).toBe(true);
    // Not even the office that would otherwise cover it.
    expect(isWaitingOn(named, person({ id: "a.other", riskDomain: "data-privacy" }))).toBe(false);
  });

  it("never waits on a requester — an office hand-off is not everyone's problem", () => {
    expect(isWaitingOn(handoff(), person({ role: "requester", riskDomain: null }))).toBe(false);
  });

  it("stops waiting the moment it is settled", () => {
    const done = handoff({ resolvedAt: new Date(), resolvedBy: "a.tp" });
    expect(isWaitingOn(done, person({ riskDomain: "third-party" }))).toBe(false);
  });
});

describe("who may close it, and what closing may mean", () => {
  const owner = person({ riskDomain: "third-party" });

  it("the person it was handed to may, once the question has an answer", () => {
    expect(resolutionProblem(handoff(), owner, true)).toBeNull();
  });

  it("NOT while the question is still unanswered", () => {
    // Without this, "resolved" means "somebody clicked resolved", and a
    // pinned alert that can be clicked away with the work undone is just a
    // message with extra steps.
    expect(resolutionProblem(handoff(), owner, false)).toMatch(/still has no answer/);
  });

  it("not the requester who asked — they flagged it because they could not settle it", () => {
    const asker = person({ id: "p.requester", role: "requester" });
    expect(mayResolve(handoff(), asker)).toBe(false);
    expect(resolutionProblem(handoff(), asker, true)).toMatch(/isn't yours to close/);
  });

  it("not another office", () => {
    expect(mayResolve(handoff(), person({ riskDomain: "data-privacy" }))).toBe(false);
  });

  it("an administrator may, as the escape hatch for an owner who has left", () => {
    expect(mayResolve(handoff(), person({ role: "admin" }))).toBe(true);
  });

  it("nobody may close it twice", () => {
    const done = handoff({ resolvedAt: new Date(), resolvedBy: "x" });
    expect(mayResolve(done, person({ role: "admin" }))).toBe(false);
    expect(resolutionProblem(done, owner, true)).toMatch(/already settled/);
  });
});

describe("the conversation", () => {
  const reply = (id: string, parentId: string | null): Reply => ({
    id,
    handoffId: "h1",
    parentId,
    authorId: "a",
    authorName: "A",
    body: id,
    createdAt: new Date(),
  });

  it("nests replies under what they answer", () => {
    const tree = thread([reply("1", null), reply("2", "1"), reply("3", "2"), reply("4", null)]);
    expect(tree.map((n) => n.id)).toEqual(["1", "4"]);
    expect(tree[0]!.children[0]!.id).toBe("2");
    expect(tree[0]!.children[0]!.children[0]!.id).toBe("3");
  });

  it("surfaces an orphan rather than losing what somebody said", () => {
    const tree = thread([reply("1", "gone")]);
    expect(tree.map((n) => n.id)).toEqual(["1"]);
  });
});

describe("what a person reads", () => {
  it("names the office or the person, never an identifier", () => {
    const byName = (id: string) => (id === "a.privacy" ? "Stella Blau" : "?");
    const byDomain = (key: string) => (key === "third-party" ? "Third-Party & Supply Chain" : "?");
    expect(recipientLabel(handoff(), byName, byDomain)).toBe("Third-Party & Supply Chain");
    expect(
      recipientLabel(handoff({ toPersonId: "a.privacy", toDomain: null }), byName, byDomain),
    ).toBe("Stella Blau");
  });

  it("says how long ago in words", () => {
    const now = new Date("2026-08-22T12:00:00Z");
    expect(timeAgo(new Date("2026-08-22T11:59:30Z"), now)).toBe("just now");
    expect(timeAgo(new Date("2026-08-22T11:20:00Z"), now)).toBe("40m ago");
    expect(timeAgo(new Date("2026-08-22T09:00:00Z"), now)).toBe("3h ago");
    expect(timeAgo(new Date("2026-08-19T12:00:00Z"), now)).toBe("3d ago");
  });
});
