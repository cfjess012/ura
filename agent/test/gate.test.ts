/**
 * The gate. The model proposes; this decides whether a draft may exist.
 *
 * These tests matter more than any run against a real model, because a
 * model behaving well proves nothing about what happens when it does not.
 * Every case here is a fabricated model reply — the exact shapes a model
 * produces when it is confidently wrong.
 */
import { describe, expect, it } from "vitest";
import { gate, type DraftTask } from "../src/draft.ts";

const SOURCE = {
  id: "sable-security-overview.md",
  text: "Multi-factor authentication is enforced for all administrative access to production systems, including access by Sable support staff. Standard user accounts authenticate through the customer's own identity provider.",
};

const task: DraftTask = {
  questionId: "t3.t3_iam_02",
  question: "Is MFA enforced?",
  assessment: {
    projectId: "9f1c",
    activity: "A claims triage assistant from Sable.",
    onRecord: [{ label: "Is a third party involved?", value: "Yes" }],
    openQuestions: [],
  },
  answerShape: "one of: Yes, Partial, No, N-A",
  sources: [SOURCE],
};

const good = {
  questionId: "t3.t3_iam_02",
  basis: "stated",
  value: "Yes",
  quote:
    "Multi-factor authentication is enforced for all administrative access",
  source: "sable-security-overview.md",
  because: "The source says MFA is enforced for administrative access.",
};

describe("what the gate lets through", () => {
  it("accepts a grounded answer whose quote is really in the source", () => {
    const verdict = gate(good, task);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.answer.basis).toBe("stated");
  });

  it("accepts a complete abstention", () => {
    const verdict = gate(
      {
        basis: "not_stated",
        value: null,
        quote: null,
        source: null,
        because: "Not mentioned.",
      },
      task,
    );
    expect(verdict.ok).toBe(true);
  });

  it("takes the question id from the task, not from the model", () => {
    // A model naming a different question could otherwise answer one
    // question in another's name.
    const verdict = gate({ ...good, questionId: "t3.something_else" }, task);
    expect(verdict.ok && verdict.answer.questionId).toBe("t3.t3_iam_02");
  });
});

describe("what the gate refuses", () => {
  const refusal = (reply: unknown) => {
    const verdict = gate(reply, task);
    expect(verdict.ok, "should have been refused").toBe(false);
    return verdict.ok ? "" : verdict.why;
  };

  it("refuses a paraphrase — the words were changed", () => {
    expect(
      refusal({ ...good, quote: "MFA is enforced for all admin access" }),
    ).toMatch(/verbatim/i);
  });

  it("refuses a stitched quote, the failure that most resembles a right answer", () => {
    // Both fragments are real. The sentence never existed.
    expect(
      refusal({
        ...good,
        quote: "Multi-factor authentication is enforced own identity provider.",
      }),
    ).toMatch(/verbatim/i);
  });

  it("refuses a quote citing a source that was never supplied", () => {
    // Inventing the provenance is worse than inventing the answer.
    expect(refusal({ ...good, source: "some-other-document.pdf" })).toMatch(
      /was not supplied/i,
    );
  });

  it("refuses an abstention that smuggles an answer through", () => {
    expect(
      refusal({
        basis: "not_stated",
        value: "Yes",
        quote: null,
        source: null,
        because: "...",
      }),
    ).toMatch(/carries no answer/i);
  });

  it("refuses an inference with nothing to point at", () => {
    expect(
      refusal({ ...good, basis: "inferred", quote: null, source: null }),
    ).toMatch(/is a guess/i);
  });

  it("refuses a draft that does not say why", () => {
    expect(refusal({ ...good, because: "   " })).toMatch(/say why/i);
  });

  it("refuses a basis it does not recognise", () => {
    expect(refusal({ ...good, basis: "confident" })).toMatch(
      /basis must be one of/i,
    );
    expect(refusal({ ...good, basis: undefined })).toMatch(
      /basis must be one of/i,
    );
  });

  it("refuses something that is not an object at all", () => {
    expect(refusal("Yes, MFA is enforced.")).toMatch(/not an object/i);
    expect(refusal(null)).toMatch(/not an object/i);
  });

  it("treats an empty quote as no quote, not as a passing one", () => {
    expect(refusal({ ...good, quote: "" })).toMatch(/passage it came from/i);
  });
});
