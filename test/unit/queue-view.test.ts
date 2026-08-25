import { describe, expect, it } from "vitest";
import { agedLabel, requesterQueue, reviewerQueue } from "@/lib/queue-view";
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
  const own = (id: string, daysAgo: number, submittedAt: Date | null) => ({
    id,
    projectName: id,
    businessUnit: null,
    updatedAt: new Date(NOW.getTime() - daysAgo * 86_400_000),
    submittedAt,
  });

  it("counts what is still theirs apart from what is with a reviewer", () => {
    const view = requesterQueue(
      [
        own("draft", 3, null),
        own("sent", 1, new Date(NOW.getTime() - 86_400_000)),
      ],
      NOW,
    );
    expect(view.tiles.find((t) => t.key === "attest")?.value).toBe(1);
    expect(view.tiles.find((t) => t.key === "declared")?.value).toBe(1);
  });

  it("raises the alarm on a draft nobody has touched for a week", () => {
    // The thing this product exists to prevent, and a formatted date hides.
    const quiet = requesterQueue([own("draft", 9, null)], NOW);
    expect(quiet.tiles.find((t) => t.key === "oldest")?.tone).toBe("alarm");
    const fresh = requesterQueue([own("draft", 1, null)], NOW);
    expect(fresh.tiles.find((t) => t.key === "oldest")?.tone).toBe("plain");
  });

  it("tells a draft and a submission apart in what it says", () => {
    const view = requesterQueue(
      [own("draft", 0, null), own("sent", 0, NOW)],
      NOW,
    );
    expect(view.entries.find((e) => e.id === "draft")?.says).toMatch(
      /yours to finish/,
    );
    expect(view.entries.find((e) => e.id === "sent")?.says).toMatch(
      /read-only/,
    );
  });
});
