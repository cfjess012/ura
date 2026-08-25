/**
 * The gate. The model proposes; this decides whether a draft may exist.
 *
 * These tests matter more than any run against a real model, because a
 * model behaving well proves nothing about what happens when it does not.
 * Every case here is a fabricated model reply — the exact shapes a model
 * produces when it is confidently wrong.
 */
import { describe, expect, it } from "vitest";
import { extractJson } from "../src/model.ts";
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

describe("the contextual guardrail runs on the reason a person reads", () => {
  /**
   * G-65 said this ran on a drafted answer's `because`. It did not: the
   * import was here and nothing called it. Documented before it existed,
   * which is the failure this project treats most seriously.
   */
  it("refuses a reason that says an internal identifier out loud", () => {
    const verdict = gate({ ...good, because: "Required by T3-IAM-02." }, task);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.why).toMatch(/our problem, not theirs/);
  });

  it("refuses a reason attributing an answer nobody gave", () => {
    const verdict = gate(
      { ...good, because: "You told us there is no personal data." },
      task,
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.why).toMatch(/not on the record/i);
  });

  it("still accepts a reason that reads like a person wrote it", () => {
    expect(
      gate(
        { ...good, because: "The source says MFA is enforced for admins." },
        task,
      ).ok,
    ).toBe(true);
  });
});

/**
 * Reading JSON back out of a model's reply.
 *
 * Every capability funnels through this, and every capability has failed
 * here today with the same unhelpful sentence. The break that matters is
 * a long prose field: a model writing several paragraphs puts real
 * newlines inside the string rather than \n, which is not JSON however
 * well-formed the rest is.
 */
describe("finding the JSON", () => {
  it("repairs raw newlines inside a string", () => {
    const broken =
      '{"description":"First para.\n\nSecond para.","placeholders":[]}';
    const parsed = JSON.parse(extractJson(broken)) as {
      description: string;
    };
    // Repaired, not reformatted: the characters are kept exactly, only
    // spelled the way the format requires.
    expect(parsed.description.split("\n\n")).toHaveLength(2);
  });

  it("keeps an escaped quote escaped while repairing", () => {
    const broken = '{"a":"he said \\"yes\\"\nand left"}';
    const parsed = JSON.parse(extractJson(broken)) as { a: string };
    expect(parsed.a).toContain('"yes"');
    expect(parsed.a).toContain("\nand left");
  });

  it("reads a fenced block", () => {
    expect(JSON.parse(extractJson('```json\n{"a":1}\n```'))).toEqual({ a: 1 });
  });

  it("takes the block that parses, not the first one", () => {
    const text = '```\nnot json\n```\nthen\n```json\n{"a":2}\n```';
    expect(JSON.parse(extractJson(text))).toEqual({ a: 2 });
  });

  it("throws when there is genuinely nothing", () => {
    expect(() => extractJson("no object here at all")).toThrow();
  });
});
