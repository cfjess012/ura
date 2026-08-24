/**
 * The conversational gate. Narrower than the drafting gate on purpose —
 * this is conversation, and holding a thought partner to the verbatim
 * standard would make it useless.
 *
 * What it does check is the one thing that would actually harm somebody: a
 * friendly model telling them their work is recorded when it is not. A
 * person who believes their assessment was submitted stops working on it.
 */
import { describe, expect, it } from "vitest";
import { conversationGate } from "../src/converse.ts";

const good = {
  reply:
    "Most scheduling tools in your position touch employee data — does yours?",
  carriesEvidence: false,
  asking: "Does the tool process personal data about employees?",
};

describe("what a thought partner may say", () => {
  it("lets a helpful reply through, general knowledge and all", () => {
    // World knowledge in conversation is the point (§22.2). It just never
    // becomes evidence.
    const verdict = conversationGate(good);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.reply.asking).toMatch(/personal data/);
  });

  it("carries the evidence flag through when the model sets it", () => {
    const verdict = conversationGate({ ...good, carriesEvidence: true });
    expect(verdict.ok && verdict.reply.carriesEvidence).toBe(true);
  });

  it("treats a missing or non-boolean flag as no evidence, never as yes", () => {
    // Defaulting the other way would start a drafting pass over nothing.
    expect(conversationGate({ ...good, carriesEvidence: undefined }).ok).toBe(
      true,
    );
    const verdict = conversationGate({ ...good, carriesEvidence: "yes" });
    expect(verdict.ok && verdict.reply.carriesEvidence).toBe(false);
  });

  it("treats an empty question as no question", () => {
    const verdict = conversationGate({ ...good, asking: "   " });
    expect(verdict.ok && verdict.reply.asking).toBeNull();
  });
});

describe("what it may never say", () => {
  const refusal = (reply: string) => {
    const verdict = conversationGate({ ...good, reply });
    expect(verdict.ok, `should have been refused: "${reply}"`).toBe(false);
    return verdict.ok ? "" : verdict.why;
  };

  it("refuses a claim that something was recorded", () => {
    expect(refusal("Thanks — I've recorded that as a Yes.")).toMatch(
      /recorded or signed/i,
    );
    expect(refusal("I have saved your answer.")).toMatch(/recorded or signed/i);
  });

  it("refuses a claim that something was submitted or signed", () => {
    expect(refusal("Your assessment has been submitted.")).toMatch(
      /recorded or signed/i,
    );
    expect(refusal("That's been signed off.")).toMatch(/recorded or signed/i);
  });

  it("refuses a claim to have performed a person's act", () => {
    expect(refusal("I've marked it as not applicable.")).toMatch(
      /recorded or signed/i,
    );
    expect(refusal("I have attested that control for you.")).toMatch(
      /recorded or signed/i,
    );
  });

  it("allows talking ABOUT those acts, which is most of the job", () => {
    // The check must not stop it explaining the process.
    for (const fine of [
      "Once you submit, a Risk Assessor signs each control answer.",
      "You'll be asked to confirm these answers are accurate before it goes.",
      "If you answer No here, that becomes a finding a reviewer settles.",
    ]) {
      expect(conversationGate({ ...good, reply: fine }).ok, fine).toBe(true);
    }
  });

  it("refuses an empty reply", () => {
    expect(refusal("   ")).toMatch(/empty/i);
    expect(conversationGate({ ...good, reply: undefined }).ok).toBe(false);
  });

  it("refuses something that is not an object", () => {
    expect(conversationGate("just a string").ok).toBe(false);
    expect(conversationGate(null).ok).toBe(false);
  });
});
