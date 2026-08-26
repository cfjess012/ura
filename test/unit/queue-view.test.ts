import { describe, expect, it } from "vitest";
import { agedLabel, requesterQueue, reviewerQueue } from "@/lib/queue-view";
import type { OwnStanding, Turn } from "@/lib/progress";
import type { ReviewCounts } from "@/lib/review-standing";

const NOW = new Date("2026-08-25T09:00:00Z");
const NONE: ReviewCounts = {
  answeredIds: [],
  attestedIds: [],
  openGaps: [],
  openEnhancements: [],
  openViolations: [],
  declaredGaps: 0,
};

function submitted(id: string, daysAgo: number, counts = NONE) {
  return {
    id,
    projectName: id,
    businessUnit: null,
    startedBy: "Isabelle Withers",
    submittedAt: new Date(NOW.getTime() - daysAgo * 86_400_000),
    counts,
  };
}

describe("the reviewer's queue as a day's work", () => {
  it("separates a decision only this reader can make from one they can't", () => {
    const queue = reviewerQueue(
      [
        submitted("mine", 1, { ...NONE, answeredIds: ["t3.a"] }),
        submitted("requester", 1, { ...NONE, declaredGaps: 4 }),
      ],
      NOW,
    );
    expect(queue.groups.map((g) => g.key)).toEqual(["blocked", "waiting"]);
    expect(queue.blocking).toBe(1);
  });

  it("files another domain's work as theirs, not as the requester's", () => {
    // Filing it under the requester tells an assessor to chase somebody who
    // is not holding anything up.
    const queue = reviewerQueue(
      [submitted("theirs", 1, { ...NONE, answeredIds: ["t3.a"] })],
      NOW,
      () => false,
      () => false,
    );
    expect(queue.groups.map((g) => g.key)).toEqual(["elsewhere"]);
    expect(queue.blocking).toBe(0);
  });

  it("puts the oldest first, so nothing waits three weeks quietly", () => {
    const busy = { ...NONE, answeredIds: ["t3.a"] };
    const queue = reviewerQueue(
      [
        submitted("new", 0, busy),
        submitted("old", 9, busy),
        submitted("mid", 3, busy),
      ],
      NOW,
    );
    expect(queue.groups[0].entries.map((e) => e.id)).toEqual([
      "old",
      "mid",
      "new",
    ]);
  });

  it("counts only numbers this reader can act on", () => {
    const counts = {
      ...NONE,
      openViolations: ["theirs"],
      answeredIds: ["t3.theirs"],
    };
    const queue = reviewerQueue(
      [submitted("a", 1, counts)],
      NOW,
      () => false,
      () => false,
    );
    const tile = (key: string) => queue.tiles.find((t) => t.key === key)?.value;
    expect(tile("violations")).toBe(0);
    expect(tile("attest")).toBe(0);
  });

  it("says how long, in words rather than a date to subtract from today", () => {
    expect(agedLabel(0)).toBe("today");
    expect(agedLabel(1)).toBe("1 day open");
    expect(agedLabel(12)).toBe("12 days open");
  });

  it("says what each assessment is waiting for, in one sentence", () => {
    const queue = reviewerQueue(
      [
        submitted("a", 1, {
          ...NONE,
          answeredIds: ["t3.a"],
          openViolations: ["v"],
        }),
      ],
      NOW,
    );
    const says = queue.groups[0].entries[0].says;
    expect(says).toMatch(/attestation/);
    expect(says).toMatch(/policy clause/);
    expect(says.endsWith(".")).toBe(true);
  });
});

describe("the requester's own view", () => {
  const standing = (turn: Turn): OwnStanding => ({
    step: turn === "you" ? 1 : turn === "reviewer" ? 3 : 4,
    stepLabel: "Tell us about it",
    turn,
    says: "something outstanding",
    meter: null,
  });
  const own = (
    id: string,
    daysAgo: number,
    submittedAt: Date | null,
    turn: Turn = submittedAt ? "reviewer" : "you",
  ) => ({
    id,
    projectName: id,
    businessUnit: null,
    updatedAt: new Date(NOW.getTime() - daysAgo * 86_400_000),
    submittedAt,
    standing: standing(turn),
  });

  it("groups by whose move it is, not by what exists", () => {
    // The question somebody opens this list with. A flat list of identical
    // rows answers a different one.
    const view = requesterQueue(
      [
        own("draft", 3, null),
        own("sent", 1, new Date(NOW.getTime() - 86_400_000)),
        own("done", 1, new Date(NOW.getTime() - 86_400_000), "settled"),
      ],
      NOW,
    );
    expect(view.groups.map((g) => g.key)).toEqual([
      "you",
      "reviewer",
      "settled",
    ]);
    expect(view.groups.map((g) => g.entries.length)).toEqual([1, 1, 1]);
  });

  it("shows no group it has nothing to put in", () => {
    const view = requesterQueue([own("draft", 1, null)], NOW);
    expect(view.groups.map((g) => g.key)).toEqual(["you"]);
  });

  it("puts the oldest first, because a queue newest-first hides the stale", () => {
    const view = requesterQueue(
      [own("fresh", 1, null), own("stale", 12, null), own("mid", 5, null)],
      NOW,
    );
    expect(view.groups[0]!.entries.map((e) => e.id)).toEqual([
      "stale",
      "mid",
      "fresh",
    ]);
  });

  it("says out loud how stale the oldest draft is, once", () => {
    // The one fact the tiles carried that the groups do not count for
    // themselves. Said in the group it belongs to rather than as a
    // fourth number above three that already say it (§24.6).
    const quiet = requesterQueue([own("draft", 9, null)], NOW);
    expect(quiet.groups[0]!.because).toMatch(/untouched for 9 days/);
    const fresh = requesterQueue([own("draft", 1, null)], NOW);
    expect(fresh.groups[0]!.because).not.toMatch(/untouched/);
  });

  it("ages each one in the words its own state deserves", () => {
    // "with a reviewer 6 days" over an assessment that is signed and
    // settled says the one thing about it that is no longer true.
    const then = new Date(NOW.getTime() - 4 * 86_400_000);
    const view = requesterQueue(
      [
        own("draft", 4, null),
        own("sent", 4, then),
        own("done", 4, then, "settled"),
      ],
      NOW,
    );
    const aged = (id: string) => view.entries.find((e) => e.id === id)?.aged;
    expect(aged("draft")).toBe("untouched for 4 days");
    expect(aged("sent")).toBe("with a reviewer 4 days");
    expect(aged("done")).toBe("submitted 4 days ago");
  });
});
