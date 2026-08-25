import { describe, expect, it } from "vitest";
import { isTrouble, tellTrouble } from "@/lib/assistant-trouble";
import type { Trouble } from "@/lib/agent-contract";

const ALL: Trouble[] = [
  "unreachable",
  "auth",
  "rate",
  "overloaded",
  "network",
  "unavailable",
];

describe("what a person is told when the assistant could not answer", () => {
  it("has a sentence for every trouble the contract names", () => {
    for (const why of ALL) {
      expect(tellTrouble(why).message.length).toBeGreaterThan(20);
    }
  });

  it("does not tell somebody to try again when trying again cannot help", () => {
    // A rejected key and a stopped service are not waiting problems. The
    // old single message invited a retry for both, which is how somebody
    // clicks four times and concludes the product is broken.
    expect(tellTrouble("auth").retryable).toBe(false);
    expect(tellTrouble("unreachable").retryable).toBe(false);
    expect(tellTrouble("rate").retryable).toBe(true);
    expect(tellTrouble("overloaded").retryable).toBe(true);
  });

  it("never blames the person's document or their writing", () => {
    for (const why of ALL) {
      const said = tellTrouble(why).message.toLowerCase();
      expect(said).not.toMatch(/your (document|writing) (is|was) /);
    }
  });

  it("says the work is safe, in every one of them", () => {
    // Every one of these arrives mid-task, on a screen somebody has been
    // typing into. The first question is always whether what they wrote
    // survived, and a message that leaves it unanswered gets read as "no".
    for (const why of ALL) {
      expect(tellTrouble(why).message).toMatch(/untouched|nothing .*lost/i);
    }
  });

  it("tells apart a trouble from a judgement about their text", () => {
    expect(isTrouble("refused")).toBe(false);
    expect(isTrouble("auth")).toBe(true);
    expect(isTrouble("nonsense")).toBe(false);
  });

  it("names an expired key as a key problem, not a retry", () => {
    // The whole point of the split: this is the one somebody can act on.
    expect(tellTrouble("auth").message).toMatch(/key/i);
    expect(tellTrouble("auth").message).not.toMatch(/try again shortly/i);
  });
});
