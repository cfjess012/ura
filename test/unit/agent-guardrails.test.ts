/**
 * Output guardrails — what an agent may say to a person, checked against
 * the assessment record it was given.
 *
 * These are the checks that make a drafted answer safe to show. Each one
 * exists because of a specific, plausible failure, and the test says which.
 */
import { describe, expect, it } from "vitest";
import {
  claimsUnrecordedAnswer,
  contextualGuardrail,
  utteredInternalIdentifier,
  type AssessmentContext,
} from "@/lib/agent-contract";

const context: AssessmentContext = {
  projectId: "9f1c",
  activity:
    "A claims triage assistant from Sable that proposes which queue a claim belongs in.",
  onRecord: [
    { label: "Does this use AI or machine learning?", value: "Yes" },
    { label: "Is a third party involved?", value: "Yes" },
    { label: "Data classification", value: "Confidential" },
  ],
  openQuestions: [
    "Who is the business owner?",
    "Does it process personal data?",
  ],
};

describe("internal identifiers never reach a person", () => {
  it("catches a question id", () => {
    // The likeliest failure of all: the model is handed ids in its own
    // instructions, and repeating one feels helpful.
    expect(utteredInternalIdentifier("t3.t3_iam_02 is still unanswered.")).toBe(
      "t3.t3_iam_02",
    );
    expect(utteredInternalIdentifier("Have a look at sev.tpr_la_1.")).toBe(
      "sev.tpr_la_1",
    );
    expect(utteredInternalIdentifier("gate.ai was answered.")).toBe("gate.ai");
  });

  it("catches a control objective and a severity code", () => {
    expect(utteredInternalIdentifier("This pulls in T3-IAM-02.")).toBe(
      "T3-IAM-02",
    );
    expect(utteredInternalIdentifier("That comes from T2-TPR-1.")).toBe(
      "T2-TPR-1",
    );
  });

  it("leaves ordinary sentences alone", () => {
    for (const fine of [
      "Multi-factor authentication is enforced for administrative access.",
      "You still need to say who the business owner is.",
      "Version 3.2 of the policy defines Confidential.",
      "The tool is from Sable Analytics.",
    ]) {
      expect(utteredInternalIdentifier(fine), fine).toBeNull();
    }
  });
});

describe("an answer is never attributed to somebody who did not give it", () => {
  it("accepts a recap of what is genuinely on record", () => {
    expect(
      claimsUnrecordedAnswer("You answered Yes to the AI question.", context),
    ).toBeNull();
    expect(
      claimsUnrecordedAnswer("You said Confidential earlier.", context),
    ).toBeNull();
  });

  it("catches an answer the person never gave", () => {
    // The failure that matters: a busy person reads a confident recap as
    // confirmation and stops checking.
    expect(
      claimsUnrecordedAnswer("You told us there is no personal data.", context),
    ).toMatch(/no personal data/i);
    expect(
      claimsUnrecordedAnswer(
        "You selected Restricted for classification.",
        context,
      ),
    ).toMatch(/Restricted/);
  });

  it("ignores sentences that attribute nothing", () => {
    expect(
      claimsUnrecordedAnswer(
        "Would you say this holds personal data?",
        context,
      ),
    ).toBeNull();
    expect(
      claimsUnrecordedAnswer(
        "Most tools like this touch personal data — does yours?",
        context,
      ),
    ).toBeNull();
  });
});

describe("one guardrail, so a new capability cannot ship with half the checks", () => {
  it("passes a reply that is grounded and speaks plainly", () => {
    expect(
      contextualGuardrail(
        "You answered Yes to the AI question, so I need to know whether it processes personal data.",
        context,
      ),
    ).toBeNull();
  });

  it("explains an identifier leak in terms of whose problem it is", () => {
    expect(contextualGuardrail("t3.t3_iam_02 is open.", context)).toMatch(
      /our problem, not theirs/,
    );
  });

  it("explains an invented attribution", () => {
    expect(contextualGuardrail("You said it is Public data.", context)).toMatch(
      /not on the record/i,
    );
  });
});
