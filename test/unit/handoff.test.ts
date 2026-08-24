/**
 * S4.7 — "leave this to us" (FR-35..FR-37).
 *
 * The rules that decide who a question is waiting on, who may close it, and
 * what "closed" is allowed to mean. All pure, so none of it needs a browser.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  askedByRole: "requester",
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

describe("the obligation is derived from the answer, not a stored flag", () => {
  // The bell promises "these clear themselves when the work is done — they
  // can't be dismissed". Only the second half was true: the rule branched on
  // resolvedAt alone, so answering the question left the obligation sitting
  // there until the recipient clicked Mark resolved — a stored flag wearing
  // a derived rule's clothes, and a false sentence on screen (verifier F1).
  it("stops waiting the moment the question has an answer", () => {
    const open = handoff();
    const samuel = person({ riskDomain: "third-party" });
    expect(isWaitingOn(open, samuel, false)).toBe(true);
    expect(isWaitingOn(open, samuel, true)).toBe(false);
  });

  it("an answer clears it for a named recipient too", () => {
    const named = { ...handoff(), toPersonId: "a.privacy", toDomain: null };
    expect(isWaitingOn(named, person({ id: "a.privacy" }), false)).toBe(true);
    expect(isWaitingOn(named, person({ id: "a.privacy" }), true)).toBe(false);
  });

  it("defaults to unanswered, so a caller that forgets errs toward showing work", () => {
    expect(isWaitingOn(handoff(), person({ riskDomain: "third-party" }))).toBe(true);
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
  authorRole: "assessor",
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

describe("the hand-off panel's failure paths (verifier F3, F4)", () => {
  // Every action in the panel awaited the server with no try/catch, so a
  // transport failure threw uncaught, said nothing, and left `busy` true —
  // the panel dead until reload. §25 and §24.4 both forbid that, and every
  // other surface in the product already had the guard.
  const panel = readFileSync(
    join(__dirname, "..", "..", "src/app/(app)/projects/[id]/assess/severity/handoff-panel.tsx"),
    "utf8",
  );

  it.each(["hand", "post", "close"])("%s catches a transport failure", (fn) => {
    const at = panel.indexOf(`async function ${fn}(`);
    expect(at, `${fn} not found`).toBeGreaterThan(-1);
    const body = panel.slice(at, panel.indexOf("\n  }", at));
    expect(body, `${fn} must try/catch`).toMatch(/try \{[\s\S]*\} catch \(cause\)/);
    expect(body, `${fn} must clear busy in finally, or the panel stays dead`).toMatch(
      /\} finally \{[\s\S]*setBusy\(false\)/,
    );
  });

  it("shows the reference every other error surface shows", () => {
    expect(panel).toMatch(/withRef\(result\.message, result\.ref\)/);
    expect(panel).toMatch(/Reference \$\{ref\}/);
  });
});

describe("a hand-off open at submission is not a deadlock (verifier S2)", () => {
  // Answering is refused once an assessment is submitted, so requiring an
  // answer before closing made the hand-off permanently unresolvable — and
  // the obligation in the recipient's bell could never clear, which is the
  // one thing FR-36 promises.
  const open = handoff();
  const samuel = person({ riskDomain: "third-party" });

  it("still refuses while the assessment is a draft and the question is unanswered", () => {
    expect(resolutionProblem(open, samuel, false, false)).toMatch(/still has no answer/);
  });

  it("allows closing once the assessment has been submitted", () => {
    expect(resolutionProblem(open, samuel, false, true)).toBeNull();
  });

  it("submission does not hand the close to somebody it was never with", () => {
    const stranger = person({ id: "d.grant", role: "requester", riskDomain: null });
    expect(resolutionProblem(open, stranger, false, true)).toMatch(/isn't yours to close/);
  });
});
