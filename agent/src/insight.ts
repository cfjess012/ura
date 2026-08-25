/**
 * Why a risk area is asking what it is asking (FR-47).
 *
 * The platform lights parts of an area from answers given earlier and shows
 * the rule that lit each one. That is honest and it is terse — "you told us
 * this uses AI and involves a company outside ours" explains the rule
 * without joining it to the rest of what somebody said, and a person
 * looking at four ticks they did not make wants the join.
 *
 * The rules are **given**, never inferred: the platform decides what is
 * lit, this only explains it. A model reconstructing a plausible reason for
 * a rule it was not shown would be inventing the product's own logic.
 */
import { trace } from "@opentelemetry/api";
import {
  contextualGuardrail,
  type AssessmentContext,
} from "../../src/lib/agent-contract.ts";
import { extractJson, modelClient, modelId, textOf } from "./model.ts";
import { composeInsightPrompt, promptVersion } from "./prompt.ts";

const tracer = trace.getTracer("ura-agent");

export type InsightTask = {
  /** The area they are looking at, in its own words. */
  area: string;
  /** The parts of it, and whether each is ticked. */
  parts: Array<{ name: string; ticked: boolean }>;
  /** The parts the platform lit, with the rule that lit each. */
  added: Array<{ name: string; because: string }>;
  assessment: AssessmentContext;
};

export type Insight = { insight: string[] };

/** How long an explanation may run before it has become a report. */
const PARAGRAPH_CEILING = 700;
const PARAGRAPHS_MAX = 3;

export function insightGate(
  parsed: unknown,
  assessment: AssessmentContext,
): { ok: true; insight: Insight } | { ok: false; why: string } {
  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      why: "the model returned something that is not an object",
    };
  }
  const raw = (parsed as { insight?: unknown }).insight;
  const paragraphs = (
    Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : []
  )
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim().slice(0, PARAGRAPH_CEILING))
    .filter((p) => p !== "")
    .slice(0, PARAGRAPHS_MAX);
  if (paragraphs.length === 0)
    return { ok: false, why: "there was nothing in it" };
  // The same two checks every human-readable output passes: no internal
  // identifier, and no answer attributed to somebody who did not give it.
  const wrong = contextualGuardrail(paragraphs.join(" "), assessment);
  if (wrong) return { ok: false, why: wrong };
  return { ok: true, insight: { insight: paragraphs } };
}

/** Explain it, or return null — an explanation is never load-bearing. */
export async function explain(task: InsightTask): Promise<Insight | null> {
  return tracer.startActiveSpan("insight", async (span) => {
    span.setAttribute("prompt.version", promptVersion());
    span.setAttribute("model.id", modelId());
    try {
      const client = modelClient();
      const message = await client.messages.create({
        model: modelId(),
        max_tokens: 2000,
        messages: [{ role: "user", content: composeInsightPrompt(task) }],
      });
      if ((message as { stop_reason?: string }).stop_reason === "max_tokens") {
        span.setAttribute("gate.result", "truncated");
        return null;
      }
      const text = textOf(
        message as unknown as {
          content: Array<{ type: string; text?: string }>;
        },
      );
      const verdict = insightGate(
        JSON.parse(extractJson(text)),
        task.assessment,
      );
      if (!verdict.ok) {
        span.setAttribute("gate.result", "refused");
        span.setAttribute("gate.why", verdict.why);
        return null;
      }
      span.setAttribute("gate.result", "passed");
      return verdict.insight;
    } catch (cause) {
      span.setAttribute("gate.result", "threw");
      console.error("[insight]", cause);
      return null;
    } finally {
      span.end();
    }
  });
}
