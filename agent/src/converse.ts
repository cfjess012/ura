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
import { extractJson, modelClient, modelId, textOf } from "./model.ts";
import { composeConversePrompt, promptVersion } from "./prompt.ts";

const tracer = trace.getTracer("ura-agent");

export type ConverseTask = {
  /** What the person just said. */
  said: string;
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

  return {
    ok: true,
    reply: {
      reply,
      carriesEvidence: raw.carriesEvidence === true,
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
        max_tokens: 1500,
        messages: [{ role: "user", content: composeConversePrompt(task) }],
      });
      const text = textOf(
        message as unknown as {
          content: Array<{ type: string; text?: string }>;
        },
      );
      const verdict = conversationGate(JSON.parse(extractJson(text)));
      if (!verdict.ok) {
        span.setAttribute("gate.result", "refused");
        span.setAttribute("gate.why", verdict.why);
        return {
          reply:
            "Something went wrong on my side, so I have not replied properly. Nothing you have written was affected — carry on answering, and everything still saves as you go.",
          carriesEvidence: false,
          asking: null,
        };
      }
      span.setAttribute("gate.result", "passed");
      span.setAttribute("carries.evidence", verdict.reply.carriesEvidence);
      return verdict.reply;
    } catch (cause) {
      span.setAttribute("gate.result", "threw");
      console.error("[converse]", cause);
      return {
        reply:
          "I could not reach the model just now, so I have nothing useful to add. Everything you have written is saved and the questions still work as normal.",
        carriesEvidence: false,
        asking: null,
      };
    } finally {
      span.end();
    }
  });
}
