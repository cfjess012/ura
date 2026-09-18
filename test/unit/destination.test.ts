/**
 * Where a thing lives (owner rule, 2026-08-22): an alert carries a
 * destination, and the destination is the thing itself.
 */
import { describe, expect, it } from "vitest";
import { destinationFor, FOCUS } from "@/lib/destination";
import { OBJECTIVES } from "@/lib/tier3";

describe("a control objective has a screen of its own", () => {
  const objective = OBJECTIVES[0]!;

  it("lands on the controls screen, anchored to the objective", () => {
    const to = destinationFor("p1", objective.questionId);
    expect(to?.href).toBe(
      `/projects/p1/assess/objectives?${FOCUS}=${encodeURIComponent(objective.questionId)}`,
    );
    expect(to?.label).toBe(objective.name);
  });

  it("sends a follow-up to its parent's card, where it is asked", () => {
    const parent = OBJECTIVES.find((o) => o.children.length > 0);
    if (!parent) return;
    const to = destinationFor("p1", parent.children[0]!.questionId);
    expect(to?.href).toContain(encodeURIComponent(parent.questionId));
  });

  it("still says nothing for a question with no screen", () => {
    expect(destinationFor("p1", "nothing.of.the.kind")).toBeNull();
  });
});
