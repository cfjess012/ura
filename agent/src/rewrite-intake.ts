/**
 * Rewriting a long-form intake field to the rubric's shape (FR-43).
 *
 * **It uses only facts the person already wrote.** Anything the rubric
 * wants and they did not say becomes a bracketed placeholder naming what is
 * needed — never an invention, however plausible. A placeholder is honest;
 * an invented fact would be signed for by somebody who did not write it.
 *
 * The result is a suggestion they edit and resubmit. It is never recorded
 * on their behalf, and the grading judges whatever is finally submitted
 * rather than what was offered.
 */
import { trace } from "@opentelemetry/api";
import { extractJson, modelClient, modelId, textOf } from "./model.ts";
import { composeRewritePrompt, promptVersion } from "./prompt.ts";

const tracer = trace.getTracer("ura-agent");

export type RewriteTask = {
  /** The field's own label, so the rewrite stays about the right thing. */
  label: string;
  /** What they wrote. */
  original: string;
  /** What it fell short on, and what full marks would look like. */
  shortfalls: Array<{ label: string; ask: string; anchor: string }>;
};

export type Rewrite = {
  rewrite: string;
  placeholders: string[];
  kept: string;
};

/**
 * Why there is no suggestion, when there is none.
 *
 * `refused` means the gate looked at one and said no — their text stands.
 * `unavailable` means we never got one. Telling somebody their writing
 * needs no work when in fact the model fell over is the same lie as
 * promising quotes that are not there.
 */
export type NoRewrite = { why: "refused" | "unavailable" };

/** How much longer than the original a rewrite may be before it has added. */
const LENGTH_CEILING = 1.6;

/**
 * What is wrong with a rewrite, or null.
 *
 * The checks that matter are about **addition**: a rewrite that grew a lot
 * has put something in, and the only thing it may put in is a placeholder.
 */
export function rewriteGate(
  parsed: unknown,
  task: RewriteTask,
): { ok: true; rewrite: Rewrite } | { ok: false; why: string } {
  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      why: "the model returned something that is not an object",
    };
  }
  const raw = parsed as Record<string, unknown>;
  const rewrite = typeof raw.rewrite === "string" ? raw.rewrite.trim() : "";
  if (rewrite === "") return { ok: false, why: "the rewrite was empty" };

  if (rewrite === task.original.trim()) {
    return {
      ok: false,
      why: "the rewrite is identical to what they already wrote",
    };
  }

  // Placeholders are the one thing a rewrite is allowed to add, so they do
  // not count towards having added. Measuring the whole string rejected
  // good rewrites for doing exactly what they were asked to do — the
  // question is whether *prose* grew, not whether text did.
  const words = (text: string) =>
    text
      .replace(/\[[^\]]*\]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  if (words(rewrite) > words(task.original) * LENGTH_CEILING + 20) {
    // Grew substantially. The only thing it may add is a placeholder, and
    // this much growth is prose that came from somewhere else.
    return {
      ok: false,
      why: "the rewrite is much longer than the original, so it has added something",
    };
  }

  // Placeholders are what an honest rewrite does with a gap, so they are
  // read off the text rather than trusted from a separate field a model
  // could fill in without using any.
  const brackets = [...rewrite.matchAll(/\[([^\]]{3,200})\]/g)].map((m) =>
    m[1]!.trim(),
  );

  return {
    ok: true,
    rewrite: {
      rewrite,
      placeholders: brackets,
      kept: typeof raw.kept === "string" ? raw.kept.trim() : "",
    },
  };
}

/** Suggest a rewrite, or say why there is none. */
export async function rewriteIntake(
  task: RewriteTask,
): Promise<Rewrite | NoRewrite> {
  return tracer.startActiveSpan("rewrite-intake", async (span) => {
    span.setAttribute("prompt.version", promptVersion());
    span.setAttribute("model.id", modelId());
    try {
      const client = modelClient();
      const message = await client.messages.create({
        model: modelId(),
        max_tokens: 3000,
        messages: [{ role: "user", content: composeRewritePrompt(task) }],
      });
      const text = textOf(
        message as unknown as {
          content: Array<{ type: string; text?: string }>;
        },
      );
      const verdict = rewriteGate(JSON.parse(extractJson(text)), task);
      if (!verdict.ok) {
        span.setAttribute("gate.result", "refused");
        span.setAttribute("gate.why", verdict.why);
        return { why: "refused" as const };
      }
      span.setAttribute("gate.result", "passed");
      span.setAttribute("placeholders", verdict.rewrite.placeholders.length);
      return verdict.rewrite;
    } catch (cause) {
      span.setAttribute("gate.result", "threw");
      console.error("[rewrite-intake]", cause);
      return { why: "unavailable" as const };
    } finally {
      span.end();
    }
  });
}
