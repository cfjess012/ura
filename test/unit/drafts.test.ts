/**
 * FR-22 · what the record accepts from a model, and what it says after.
 *
 * The gate here is the record's own. The agent has one too, and they are
 * not redundant: the agent's protects the wire, this one protects the
 * table, and only this one is on the side that owns the consequence.
 */
import { describe, expect, it } from "vitest";
import {
  admissibleDraft,
  INTAKE_SOURCE,
  proposalSentence,
  type ProposalOutcome,
} from "@/lib/drafts";

const source =
  "Project Description: Claims are processed via OpenAI's enterprise API.";
const against = {
  text: source,
  open: new Set(["gate.third_party"]),
  values: ["Yes", "No"] as const,
};

describe("what the record will accept", () => {
  it("accepts a grounded answer to an open question", () => {
    const verdict = admissibleDraft(
      {
        questionId: "gate.third_party",
        value: "Yes",
        basis: "stated",
        quote: "processed via OpenAI's enterprise API",
      },
      against,
    );
    expect(verdict).toEqual({ ok: true, value: "Yes" });
  });

  it("treats abstention as a correct outcome, not a fault", () => {
    expect(
      admissibleDraft(
        { questionId: "gate.third_party", value: null, basis: "not_stated" },
        against,
      ),
    ).toEqual({ ok: false, why: "abstained" });
  });

  it("refuses a quote that is not in the source", () => {
    expect(
      admissibleDraft(
        {
          questionId: "gate.third_party",
          value: "Yes",
          basis: "stated",
          quote: "we use Acme Analytics",
        },
        against,
      ),
    ).toEqual({ ok: false, why: "unquoted" });
  });

  it("refuses an answer with no quote at all", () => {
    expect(
      admissibleDraft(
        { questionId: "gate.third_party", value: "Yes", basis: "stated" },
        against,
      ).ok,
    ).toBe(false);
  });

  it("refuses a question nobody left open", () => {
    // Insert-only, newest wins: this would land on top of an answer they
    // already gave and show as a proposal over their own decision.
    expect(
      admissibleDraft(
        {
          questionId: "gate.ai",
          value: "Yes",
          basis: "stated",
          quote: "processed via OpenAI's enterprise API",
        },
        against,
      ),
    ).toEqual({ ok: false, why: "not-open" });
  });

  it("drops a value the gate does not offer rather than coercing it", () => {
    // A hedge read as "No" is an answer nobody gave, under their name.
    expect(
      admissibleDraft(
        {
          questionId: "gate.third_party",
          value: "Probably, if the pilot expands",
          basis: "stated",
          quote: "processed via OpenAI's enterprise API",
        },
        against,
      ),
    ).toEqual({ ok: false, why: "not-an-answer" });
  });

  it("matches a quote across a line wrap, using the one matcher", () => {
    expect(
      admissibleDraft(
        {
          questionId: "gate.third_party",
          value: "Yes",
          basis: "stated",
          quote: "processed via\n   OpenAI's enterprise API",
        },
        against,
      ).ok,
    ).toBe(true);
  });
});

/**
 * The rule this file exists to hold: a sentence about somebody's work may
 * only be printed on a path that actually examined it.
 */
describe("what is said afterwards", () => {
  const every: ProposalOutcome[] = [
    { outcome: "proposed", proposed: 1 },
    { outcome: "nothing-in-it" },
    { outcome: "already-answered" },
    { outcome: "not-here" },
    { outcome: "refused", because: "That assessment is not yours." },
    { outcome: "unreachable" },
  ];

  it("says something for every outcome", () => {
    for (const outcome of every) {
      expect(proposalSentence(outcome).length).toBeGreaterThan(0);
    }
  });

  it("never says a thing about their writing when nothing read it", () => {
    expect(proposalSentence({ outcome: "unreachable" })).not.toMatch(
      /read|what you wrote|your description|your intake|settle/i,
    );
  });

  it("says it read them only where it did", () => {
    expect(proposalSentence({ outcome: "nothing-in-it" })).toMatch(/read/i);
  });

  it("never claims an act that belongs to a person", () => {
    for (const outcome of every) {
      expect(proposalSentence(outcome)).not.toMatch(
        /\b(recorded|saved|submitted|signed|attested|declared)\b/i,
      );
    }
  });

  it("never utters an internal identifier", () => {
    for (const outcome of every) {
      expect(proposalSentence(outcome)).not.toMatch(/\b(gate|t3|sev|path)\./);
    }
  });

  it("names the source in the person's own frame, not as a document", () => {
    expect(INTAKE_SOURCE).toMatch(/you wrote/);
    expect(INTAKE_SOURCE).not.toMatch(/document|file|upload/i);
  });
});
