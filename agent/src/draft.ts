/**
 * The drafting pass, and the gate that decides whether a draft may exist.
 *
 * The model proposes; **this file judges**. A quote that is not found in the
 * source, or a basis that contradicts what was supplied, turns the draft
 * into an error event and never into an answer. That is the whole reason a
 * drafted answer can be trusted enough to show a person.
 *
 * The gate runs on the agent's side deliberately — a bad draft should not
 * cross the wire at all.
 */
import { trace } from "@opentelemetry/api";
import {
  quoteAppearsVerbatim,
  violatesNeverGuess,
  type AgentEvent,
  type Basis,
  type DraftedAnswer,
} from "../../src/lib/agent-contract.ts";
import { extractJson, modelClient, modelId, textOf } from "./model.ts";
import { composePrompt, promptVersion } from "./prompt.ts";

const tracer = trace.getTracer("ura-agent");

/** One question to draft, and the material it may be drafted from. */
export type DraftTask = {
  questionId: string;
  question: string;
  /** How the answer must be shaped, in words the model can follow. */
  answerShape: string;
  sources: Array<{ id: string; text: string }>;
};

const BASES: Basis[] = ["stated", "inferred", "not_stated"];

/**
 * What is wrong with what the model returned, or null if it may become a
 * draft. Every check here is mechanical — none of them asks the model
 * whether it was right.
 */
export function gate(
  parsed: unknown,
  task: DraftTask,
): { ok: true; answer: DraftedAnswer } | { ok: false; why: string } {
  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      why: "the model returned something that is not an object",
    };
  }
  const raw = parsed as Record<string, unknown>;
  const basis = raw.basis;
  if (typeof basis !== "string" || !BASES.includes(basis as Basis)) {
    return { ok: false, why: `basis must be one of ${BASES.join(", ")}` };
  }
  const answer: DraftedAnswer = {
    questionId: task.questionId,
    basis: basis as Basis,
    value: (raw.value ?? null) as DraftedAnswer["value"],
    quote:
      typeof raw.quote === "string" && raw.quote.trim() !== ""
        ? raw.quote
        : null,
    source:
      typeof raw.source === "string" && raw.source.trim() !== ""
        ? raw.source
        : null,
    because: typeof raw.because === "string" ? raw.because.trim() : "",
  };

  const violation = violatesNeverGuess(answer);
  if (violation) return { ok: false, why: violation };

  if (answer.because === "") {
    return {
      ok: false,
      why: "every draft must say why, in words a person can judge",
    };
  }

  if (answer.basis !== "not_stated") {
    // The source must be one that was actually supplied. A model naming a
    // document it was never given has invented the provenance, which is a
    // worse failure than inventing the answer.
    const source = task.sources.find(
      (candidate) => candidate.id === answer.source,
    );
    if (!source) {
      return {
        ok: false,
        why: `the quote cites "${answer.source}", which was not supplied`,
      };
    }
    // The check the whole design rests on.
    if (!quoteAppearsVerbatim(answer.quote ?? "", source.text)) {
      return {
        ok: false,
        why: "the quote does not appear verbatim in the source it cites",
      };
    }
  }

  return { ok: true, answer };
}

/** Draft one question. Yields exactly one event: a draft, or an error. */
export async function draftOne(task: DraftTask): Promise<AgentEvent> {
  return tracer.startActiveSpan(`draft ${task.questionId}`, async (span) => {
    span.setAttribute("question.id", task.questionId);
    span.setAttribute("prompt.version", promptVersion());
    span.setAttribute("model.id", modelId());
    try {
      const client = modelClient();
      const reply = await client.messages.create({
        model: modelId(),
        // Generous, because a reasoning model spends most of this thinking
        // before it writes anything at all.
        max_tokens: 2000,
        messages: [{ role: "user", content: composePrompt(task) }],
      });

      const text = textOf(
        reply as unknown as { content: Array<{ type: string; text?: string }> },
      );
      if (text === "") {
        span.setAttribute("gate.result", "no-text");
        return {
          type: "error" as const,
          message: "The model returned no answer text. Nothing was drafted.",
          retryable: true,
        };
      }

      const verdict = gate(JSON.parse(extractJson(text)), task);
      span.setAttribute("gate.result", verdict.ok ? "passed" : "refused");
      if (!verdict.ok) {
        span.setAttribute("gate.why", verdict.why);
        return {
          type: "error" as const,
          // Said plainly: a refused draft is the system working, and the
          // person reading this should not think their data is at fault.
          message: `Nothing was drafted for this question — ${verdict.why}. It is left for you to answer.`,
          retryable: false,
        };
      }
      span.setAttribute("draft.basis", verdict.answer.basis);
      return { type: "draft" as const, answer: verdict.answer };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      span.setAttribute("gate.result", "threw");
      return {
        type: "error" as const,
        message: `Nothing was drafted for this question — ${message}`,
        retryable: true,
      };
    } finally {
      span.end();
    }
  });
}
