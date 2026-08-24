/**
 * The handoff summary and the risk scenarios that go with it (§4.4, §4.5).
 *
 * The agent writes prose and questions; it does not compute anything. Every
 * count, control and finding in the report is derived on the web side from
 * the record — this adds a reading of it, and a reading is allowed to be
 * wrong in a way a count is not, which is exactly why the scenarios are
 * **questions to ask** rather than conclusions.
 */
import { trace } from "@opentelemetry/api";
import {
  contextualGuardrail,
  type AssessmentContext,
} from "../../src/lib/agent-contract.ts";
import { extractJson, modelClient, modelId, textOf } from "./model.ts";
import { composeReportPrompt, promptVersion } from "./prompt.ts";

const tracer = trace.getTracer("ura-agent");

export type ReportTask = {
  assessment: AssessmentContext;
  /** The report as computed, rendered as plain text for the model to read. */
  record: string;
};

export type ReportWriting = {
  summary: string;
  scenarios: Array<{ scenario: string; ask: string; from: string[] }>;
};

/** What is wrong with what the model wrote, or null. */
export function reportGate(
  parsed: unknown,
  assessment: AssessmentContext,
): { ok: true; writing: ReportWriting } | { ok: false; why: string } {
  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      why: "the model returned something that is not an object",
    };
  }
  const raw = parsed as Record<string, unknown>;
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (summary === "") return { ok: false, why: "the summary was empty" };

  // A summary is read by a person, so it meets the same bar as anything
  // else said to one: no internal identifiers, no invented attributions.
  const ungrounded = contextualGuardrail(summary, assessment);
  if (ungrounded) return { ok: false, why: ungrounded };

  // Three sentences is the brief. Four is somebody not reading it.
  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim() !== "");
  if (sentences.length > 4) {
    return {
      ok: false,
      why: `the summary ran to ${sentences.length} sentences; the brief is three`,
    };
  }

  const scenarios: ReportWriting["scenarios"] = [];
  for (const candidate of Array.isArray(raw.scenarios) ? raw.scenarios : []) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const row = candidate as Record<string, unknown>;
    const scenario =
      typeof row.scenario === "string" ? row.scenario.trim() : "";
    const ask = typeof row.ask === "string" ? row.ask.trim() : "";
    const from = Array.isArray(row.from)
      ? row.from.filter((f): f is string => typeof f === "string")
      : [];
    if (scenario === "" || ask === "" || from.length === 0) continue;
    // The citation is checked against the real record on the web side —
    // this side only rejects what is malformed.
    if (contextualGuardrail(`${scenario} ${ask}`, assessment)) continue;
    scenarios.push({ scenario, ask, from });
  }

  return { ok: true, writing: { summary, scenarios } };
}

/** Write the summary. Never throws; a failure means the report has none. */
export async function writeReport(
  task: ReportTask,
): Promise<ReportWriting | null> {
  return tracer.startActiveSpan("report", async (span) => {
    span.setAttribute("prompt.version", promptVersion());
    span.setAttribute("model.id", modelId());
    try {
      const client = modelClient();
      const message = await client.messages.create({
        model: modelId(),
        max_tokens: 2000,
        messages: [{ role: "user", content: composeReportPrompt(task) }],
      });
      const text = textOf(
        message as unknown as {
          content: Array<{ type: string; text?: string }>;
        },
      );
      const verdict = reportGate(
        JSON.parse(extractJson(text)),
        task.assessment,
      );
      if (!verdict.ok) {
        span.setAttribute("gate.result", "refused");
        span.setAttribute("gate.why", verdict.why);
        return null;
      }
      span.setAttribute("gate.result", "passed");
      span.setAttribute("scenarios", verdict.writing.scenarios.length);
      return verdict.writing;
    } catch (cause) {
      span.setAttribute("gate.result", "threw");
      console.error("[report]", cause);
      // The report is complete without this. Returning null is a real
      // answer, not a failure to handle.
      return null;
    } finally {
      span.end();
    }
  });
}
