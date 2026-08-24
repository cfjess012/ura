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
import type { AssessmentContext } from "../../src/lib/agent-contract.ts";

/**
 * The record every reply is checked against. Required by the gate — an
 * agent that cannot be told what is on record cannot be caught claiming
 * something that is not.
 */
const assessment: AssessmentContext = {
  projectId: "9f1c",
  activity: "A claims triage assistant from Sable.",
  onRecord: [{ label: "Does this use AI or machine learning?", value: "Yes" }],
  openQuestions: ["Does it process personal data?"],
};

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
    const verdict = conversationGate(good, assessment);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.reply.asking).toMatch(/personal data/);
  });

  it("carries the evidence flag through when the model sets it", () => {
    const verdict = conversationGate(
      { ...good, carriesEvidence: true },
      assessment,
    );
    expect(verdict.ok && verdict.reply.carriesEvidence).toBe(true);
  });

  it("treats a missing or non-boolean flag as no evidence, never as yes", () => {
    // Defaulting the other way would start a drafting pass over nothing.
    expect(
      conversationGate({ ...good, carriesEvidence: undefined }, assessment).ok,
    ).toBe(true);
    const verdict = conversationGate(
      { ...good, carriesEvidence: "yes" },
      assessment,
    );
    expect(verdict.ok && verdict.reply.carriesEvidence).toBe(false);
  });

  it("treats an empty question as no question", () => {
    const verdict = conversationGate({ ...good, asking: "   " }, assessment);
    expect(verdict.ok && verdict.reply.asking).toBeNull();
  });
});

describe("what it may never say", () => {
  const refusal = (reply: string) => {
    const verdict = conversationGate({ ...good, reply }, assessment);
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
      expect(
        conversationGate({ ...good, reply: fine }, assessment).ok,
        fine,
      ).toBe(true);
    }
  });

  it("refuses an empty reply", () => {
    expect(refusal("   ")).toMatch(/empty/i);
    expect(conversationGate({ ...good, reply: undefined }, assessment).ok).toBe(
      false,
    );
  });

  it("refuses something that is not an object", () => {
    expect(conversationGate("just a string", assessment).ok).toBe(false);
    expect(conversationGate(null, assessment).ok).toBe(false);
  });
});

describe("the contextual guardrails fire inside the gate, not only in isolation", () => {
  it("refuses a reply that says an internal identifier out loud", () => {
    // The likeliest failure in practice: the model is handed ids in its own
    // instructions and repeating one feels helpful.
    const verdict = conversationGate(
      { ...good, reply: "You still need to answer t3.t3_iam_02." },
      assessment,
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.why).toMatch(/our problem, not theirs/);
  });

  it("refuses a reply attributing an answer the person never gave", () => {
    const verdict = conversationGate(
      {
        ...good,
        reply: "You told us there is no personal data, so we can move on.",
      },
      assessment,
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.why).toMatch(/not on the record/i);
  });

  it("allows a reply that recaps what genuinely is on the record", () => {
    expect(
      conversationGate(
        {
          ...good,
          reply:
            "You answered Yes to the AI question — does it use personal data?",
        },
        assessment,
      ).ok,
    ).toBe(true);
  });
});
