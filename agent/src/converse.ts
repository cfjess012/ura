/**
 * The thought partner (SPEC §22.1, the assessment companion).
 *
 * One model call makes three decisions: what to say, whether the person's
 * message carried something quotable, and what to ask next.
 *
 * **The reply is context; it is never evidence.** The model may draw on
 * general knowledge to help somebody think — that is what makes it a
 * partner rather than an autocomplete — but nothing it says becomes an
 * answer. When it judges that a message carries evidence, that only decides
 * whether a **drafting pass** runs; the drafting engine then reads the
 * person's own words and abstains if they do not support an answer.
 *
 * The prior platform's note on what this replaced is worth keeping: a regex
 * intent-router that answered "what is today's date" by starting a drafting
 * sweep. Intent is not a pattern match.
 */
import { trace } from "@opentelemetry/api";
import {
  contextualGuardrail,
  type AssessmentContext,
} from "../../src/lib/agent-contract.ts";
import { extractJson, modelClient, modelId, textOf } from "./model.ts";
import { composeConversePrompt, promptVersion } from "./prompt.ts";

const tracer = trace.getTracer("ura-agent");

export type ConverseTask = {
  /** What the person just said. */
  said: string;
  /**
   * The assessment this is about. Required, not optional: an agent that
   * cannot be told what is on record cannot be caught claiming something
   * that is not.
   */
  assessment: AssessmentContext;
  /** The conversation so far, oldest first. */
  history: Array<{ speaker: "person" | "agent"; said: string }>;
  /** Questions still open, in their own words — never their ids. */
  openQuestions: string[];
  /** What the person has already told us, for context. */
  context: string;
};

export type ConverseReply = {
  reply: string;
  carriesEvidence: boolean;
  asking: string | null;
  /**
   * They are asking to have the question in front of them answered.
   *
   * Deliberately **not** `carriesEvidence`, which means something else:
   * that their message held something quotable. Those fire on different
   * sentences — "we use Snowflake and it holds wage bands" carries evidence
   * and asks for nothing; "can you answer this from what I told you?" asks
   * and carries nothing. Reading the first as the second would propose
   * whenever somebody described their system, which is the proactive
   * drafting this was designed not to do.
   *
   * It decides whether to look, never what the answer is.
   */
  wantsAnswers: boolean;
};

/**
 * What is wrong with a conversational reply, or null.
 *
 * Narrower than the drafting gate on purpose — this is conversation, and
 * holding it to the verbatim standard would make a thought partner
 * impossible. What it does check is the thing that would actually harm
 * somebody: a model telling them their answer is recorded when it is not.
 */
export function conversationGate(
  parsed: unknown,
  assessment: AssessmentContext,
): { ok: true; reply: ConverseReply } | { ok: false; why: string } {
  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      why: "the model returned something that is not an object",
    };
  }
  const raw = parsed as Record<string, unknown>;
  if (typeof raw.reply !== "string" || raw.reply.trim() === "") {
    return { ok: false, why: "the reply was empty" };
  }
  const reply = raw.reply.trim();

  // A conversational turn must never claim an act only a person can perform.
  // This is the one place a friendly model can do real damage: somebody who
  // believes their assessment was submitted stops working on it.
  // Contractions included deliberately: "That's been signed off" slipped
  // through a pattern that only knew "has been", and a model writes the way
  // a person does.
  const APOSTROPHE = "['\u2019]";
  const claimsAnAct = new RegExp(
    [
      // "I've recorded that", "I have saved it"
      `\\bI(?:${APOSTROPHE}ve| have)? (?:recorded|saved|submitted|signed|attested|declared|accepted|resolved)\\b`,
      // "has been recorded", "that's been signed off"
      `(?:has|have|${APOSTROPHE}s|${APOSTROPHE}ve) been (?:recorded|saved|submitted|signed|attested|declared|accepted|resolved)\\b`,
      // "I've marked it as not applicable"
      `\\bI(?:${APOSTROPHE}ve| have)? (?:marked|set) (?:it|that|this) as\\b`,
    ].join("|"),
    "i",
  );
  if (claimsAnAct.test(reply)) {
    return {
      ok: false,
      why: "the reply claimed something was recorded or signed, which is a person's act and not the agent's",
    };
  }

  // The contextual guardrails: nothing said to a person may carry an
  // internal identifier or attribute an answer they never gave. Shared with
  // the drafting pass, so a new capability cannot ship with half of them.
  const ungrounded = contextualGuardrail(reply, assessment);
  if (ungrounded) return { ok: false, why: ungrounded };

  return {
    ok: true,
    reply: {
      reply,
      carriesEvidence: raw.carriesEvidence === true,
      // Same defensive shape: anything that is not literally true is false.
      // A string "true" or a 1 must not open a write path.
      wantsAnswers: raw.wantsAnswers === true,
      asking:
        typeof raw.asking === "string" && raw.asking.trim() !== ""
          ? raw.asking.trim()
          : null,
    },
  };
}

/** One conversational turn. Never throws; a failure is a sentence. */
export async function converse(task: ConverseTask): Promise<ConverseReply> {
  return tracer.startActiveSpan("converse", async (span) => {
    span.setAttribute("prompt.version", promptVersion());
    span.setAttribute("model.id", modelId());
    span.setAttribute("history.turns", task.history.length);
    try {
      const client = modelClient();
      const message = await client.messages.create({
        model: modelId(),
        // A reply now carries structure and sometimes a quoted clause, and
        // the prompt behind it carries the rubric and any policy found. At
        // 1500 it was cut mid-JSON, which surfaced as "no JSON object" and
        // reached the person as "something went wrong on my side". Third
        // time a token ceiling has done this here; each time it looked like
        // a different bug.
        max_tokens: 4000,
        messages: [{ role: "user", content: composeConversePrompt(task) }],
      });
      if ((message as { stop_reason?: string }).stop_reason === "max_tokens") {
        span.setAttribute("gate.result", "truncated");
        console.error("[converse] truncated at max_tokens");
        return {
          reply:
            "I ran out of room part-way through that answer. Ask me again and I will keep it shorter — nothing you have written was affected.",
          carriesEvidence: false,
          asking: null,
          wantsAnswers: false,
        };
      }
      const text = textOf(
        message as unknown as {
          content: Array<{ type: string; text?: string }>;
        },
      );
      // A reply that came back as prose rather than JSON is still a reply.
      // The formatting section in the prompt shows a worked example, and a
      // model following it literally writes the answer and forgets the
      // envelope — throwing that away costs the person their answer over a
      // pair of braces. Everything after this is unchanged: the same gate
      // runs, and a reply that should be refused still is.
      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJson(text));
      } catch {
        const bare = text.trim();
        if (bare === "") throw new Error("the model returned nothing");
        parsed = { reply: bare, carriesEvidence: false, asking: null };
      }
      const verdict = conversationGate(parsed, task.assessment);
      if (!verdict.ok) {
        span.setAttribute("gate.result", "refused");
        span.setAttribute("gate.why", verdict.why);
        return {
          reply:
            "Something went wrong on my side, so I have not replied properly. Nothing you have written was affected — carry on answering, and everything still saves as you go.",
          carriesEvidence: false,
          asking: null,
          wantsAnswers: false,
        };
      }
      span.setAttribute("gate.result", "passed");
      span.setAttribute("carries.evidence", verdict.reply.carriesEvidence);
      span.setAttribute("wants.answers", verdict.reply.wantsAnswers);
      return verdict.reply;
    } catch (cause) {
      span.setAttribute("gate.result", "threw");
      console.error("[converse]", cause);
      return {
        reply:
          "I could not reach the model just now, so I have nothing useful to add. Everything you have written is saved and the questions still work as normal.",
        carriesEvidence: false,
        asking: null,
        wantsAnswers: false,
      };
    } finally {
      span.end();
    }
  });
}
