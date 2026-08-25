/**
 * Drafting the activity description from a document they handed us (FR-46).
 *
 * The upload channel could propose Yes/No answers to risk-area questions
 * and nothing else — so somebody could hand over a full vendor overview and
 * still be left to type the description themselves, from the document open
 * in another window. That is the field the whole assessment routes on.
 *
 * Same discipline as the rewrite: **only what the document says**, and
 * anything it does not cover becomes a bracketed question rather than a
 * plausible sentence. They are going to attest to this text, so a fact
 * nobody can point at is a fact nobody should be signing for.
 */
import { trace } from "@opentelemetry/api";
import { extractJson, modelClient, modelId, textOf } from "./model.ts";
import { composeDescribePrompt, promptVersion } from "./prompt.ts";

const tracer = trace.getTracer("ura-agent");

export type DescribeTask = {
  /** The field's own label, so the draft is about the right thing. */
  label: string;
  /** What they wrote already, if anything. Empty is the ordinary case. */
  existing: string;
  /** The document's text, as extracted. */
  document: string;
  /** What it was called, for the sentence that reports back. */
  documentName: string;
};

export type Description = {
  description: string;
  placeholders: string[];
  from: string;
};

export type NoDescription = { why: "refused" | "unavailable" };

/** How long a description may run before it has stopped being one. */
const CEILING = 4000;

/**
 * What is wrong with a draft, or null.
 *
 * Prose cannot be verbatim-checked the way a quote can, so what is checked
 * is the shape: that there is something, that it is not the document handed
 * back, and that it is not so long it has become the document.
 */
export function describeGate(
  parsed: unknown,
  task: DescribeTask,
): { ok: true; description: Description } | { ok: false; why: string } {
  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      why: "the model returned something that is not an object",
    };
  }
  const raw = parsed as Record<string, unknown>;
  const description =
    typeof raw.description === "string" ? raw.description.trim() : "";
  if (description === "") return { ok: false, why: "the draft was empty" };
  if (description.length > CEILING) {
    return {
      ok: false,
      why: "the draft is longer than a description should be",
    };
  }
  // Handing the document back is not a description of the activity.
  if (task.document.includes(description)) {
    return {
      ok: false,
      why: "the draft is a slice of the document rather than a description",
    };
  }
  const brackets = [...description.matchAll(/\[([^\]]{3,600})\]/g)].map((m) =>
    m[1]!.trim(),
  );
  return {
    ok: true,
    description: {
      description,
      placeholders: brackets,
      from: typeof raw.from === "string" ? raw.from.trim() : "",
    },
  };
}

/** Draft it, or say why there is none. */
export async function describeIntake(
  task: DescribeTask,
): Promise<Description | NoDescription> {
  return tracer.startActiveSpan("describe-intake", async (span) => {
    span.setAttribute("prompt.version", promptVersion());
    span.setAttribute("model.id", modelId());
    try {
      const client = modelClient();
      const message = await client.messages.create({
        model: modelId(),
        max_tokens: 8000,
        messages: [{ role: "user", content: composeDescribePrompt(task) }],
      });
      if ((message as { stop_reason?: string }).stop_reason === "max_tokens") {
        span.setAttribute("gate.result", "truncated");
        console.error("[describe-intake] truncated at max_tokens");
        return { why: "unavailable" as const };
      }
      const text = textOf(
        message as unknown as {
          content: Array<{ type: string; text?: string }>;
        },
      );
      const verdict = describeGate(JSON.parse(extractJson(text)), task);
      if (!verdict.ok) {
        span.setAttribute("gate.result", "refused");
        span.setAttribute("gate.why", verdict.why);
        return { why: "refused" as const };
      }
      span.setAttribute("gate.result", "passed");
      span.setAttribute(
        "placeholders",
        verdict.description.placeholders.length,
      );
      return verdict.description;
    } catch (cause) {
      span.setAttribute("gate.result", "threw");
      console.error("[describe-intake]", cause);
      return { why: "unavailable" as const };
    } finally {
      span.end();
    }
  });
}
