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
      // Lower-cased: what comes back is the clause that was compared, not
      // a quotation to put in front of anyone.
    ).toMatch(/restricted/i);
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

describe("the cases independent verification found walking through", () => {
  /**
   * Every string below was reported as MISSED by a verifier attacking the
   * first version of these guardrails. They are the regression suite for
   * that report, and each is a shape that exists in this system's own data.
   */
  it("catches a person id, which the docstring claimed and the regex did not", () => {
    expect(
      utteredInternalIdentifier("This was flagged to a.security for review."),
    ).toBe("a.security");
    expect(utteredInternalIdentifier("p.requester has not answered it.")).toBe(
      "p.requester",
    );
  });

  it("catches a path code", () => {
    expect(
      utteredInternalIdentifier(
        "The control TPR_LA was pulled in by your answers.",
      ),
    ).toBe("TPR_LA");
    expect(utteredInternalIdentifier("Answer AI_DEC first.")).toBe("AI_DEC");
  });

  it("catches an identifier however it is cased", () => {
    expect(
      utteredInternalIdentifier("Question GATE.SOLUTION_ARCHITECTURE is open."),
    ).toBeTruthy();
    expect(utteredInternalIdentifier("See T3-DP-01.")).toBeTruthy();
  });

  it("catches a uuid", () => {
    expect(
      utteredInternalIdentifier(
        "Your assessment id is 81f66f7c-1e3a-4a2b-9c8d-2f4e6a8b0c1d.",
      ),
    ).toBeTruthy();
  });

  it("still leaves ordinary abbreviations alone", () => {
    // e.g. and i.e. have the same shape as a person id and must not trip it.
    for (const fine of [
      "Encrypt it in transit, e.g. with TLS.",
      "The classification, i.e. Confidential, decides this.",
      "Version 3.2 of the policy defines it.",
    ]) {
      expect(utteredInternalIdentifier(fine), fine).toBeNull();
    }
  });

  it("catches a claim however it is phrased", () => {
    for (const claim of [
      "You indicated the data is Public.",
      "You've said the vendor is UK-based.",
      "You confirmed there is no personal data.",
      "You marked it as internal only.",
    ]) {
      expect(claimsUnrecordedAnswer(claim, context), claim).toBeTruthy();
    }
  });

  it("refuses to let one true clause launder a false one beside it", () => {
    // The important one. Whole-sentence matching passed this on the
    // strength of "Yes" alone.
    expect(
      claimsUnrecordedAnswer(
        "You said Yes to AI, and you said the data is Restricted and personal information is involved.",
        context,
      ),
    ).toBeTruthy();
    expect(
      claimsUnrecordedAnswer(
        "You selected Yes, and you selected Public for classification.",
        context,
      ),
    ).toBeTruthy();
  });

  it("still lets an honest recap through, trailing prose and all", () => {
    expect(
      claimsUnrecordedAnswer(
        "You answered Yes to the AI question, so I need to know whether it processes personal data.",
        context,
      ),
    ).toBeNull();
  });
});

describe("the second verification pass: what still walked through", () => {
  /**
   * G-65 named the failure — "one true clause laundered every false claim
   * beside it" — and the first fix split on "and" only. A second pass found
   * the identical failure alive behind "but", a comma and a semicolon.
   *
   * Every string here was reported as MISSED. They are the regression suite
   * for the rule G-65 states: a guardrail is not shipped when it is
   * written, it is shipped when something proves it fires on the failure it
   * names.
   */
  it("catches laundering behind every separator, not just the one that was fixed", () => {
    for (const claim of [
      "You said Yes to AI, but you said the data is Restricted.",
      "You said Yes to AI, you said the data is Restricted.",
      "You said Yes to AI; you said the data is Restricted.",
      "You said the data is Restricted and Yes to AI.",
    ]) {
      expect(claimsUnrecordedAnswer(claim, context), claim).toBeTruthy();
    }
  });

  it("catches a curly apostrophe, which is what a model actually types", () => {
    expect(
      claimsUnrecordedAnswer("You’ve said the data is Restricted.", context),
    ).toBeTruthy();
  });

  it("catches an adverb wedged between the pronoun and the verb", () => {
    expect(
      claimsUnrecordedAnswer(
        "You already told us the data is Restricted.",
        context,
      ),
    ).toBeTruthy();
  });

  it("catches the verbs the first two passes did not know", () => {
    for (const claim of [
      "You wrote that the data is Restricted.",
      "You entered Restricted for the classification.",
      "You picked Restricted.",
      "You described it as Restricted.",
    ]) {
      expect(claimsUnrecordedAnswer(claim, context), claim).toBeTruthy();
    }
  });

  it("matches a recorded value as a word, never as a substring", () => {
    // "No" is on record in every assessment. A containment test passed any
    // clause holding "nothing", "not", "none" or "know", which made the
    // whole check ornamental.
    const yesNo = {
      ...context,
      onRecord: [{ label: "Is a third party involved?", value: "No" }],
    };
    expect(
      claimsUnrecordedAnswer("You said nothing about the vendor.", yesNo),
    ).toBeTruthy();
    expect(
      claimsUnrecordedAnswer("You said you do not know the region.", yesNo),
    ).toBeTruthy();
    // And the honest recap still passes.
    expect(
      claimsUnrecordedAnswer("You said No to the third-party question.", yesNo),
    ).toBeNull();
  });
});
