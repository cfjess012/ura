/**
 * Scoring an intake description against the rubric (SPEC §22.1).
 *
 * The model assigns 0/1/2 per dimension and nothing else. The pass rule and
 * every word a person reads are deterministic and live on the web side —
 * which is what makes this the smallest possible job to hand a model, and
 * the easiest to be wrong about safely.
 */
import { trace } from "@opentelemetry/api";
import { extractJson, modelClient, modelId, textOf } from "./model.ts";
import { composeScorePrompt, promptVersion } from "./prompt.ts";

const tracer = trace.getTracer("ura-agent");

export type ScoreTask = {
  description: string;
  dimensions: Array<{
    id: string;
    label: string;
    anchors: Record<string, string>;
  }>;
};

export type DimensionScore = { id: string; score: 1 | 2 | 3 | 4 };

/**
 * Keep only scores for dimensions that were actually asked about, at values
 * the rubric recognises. A model inventing a dimension, or scoring 7, is
 * dropped rather than clamped — clamping would turn nonsense into a number
 * somebody then acts on.
 */
export function scoreGate(parsed: unknown, task: ScoreTask): DimensionScore[] {
  if (typeof parsed !== "object" || parsed === null) return [];
  const raw = (parsed as { scores?: unknown }).scores;
  if (typeof raw !== "object" || raw === null) return [];
  const asked = new Set(task.dimensions.map((d) => d.id));
  const scores: DimensionScore[] = [];
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!asked.has(id)) continue;
    // 1-4 against the published anchors. Anything else is dropped rather
    // than clamped — clamping turns nonsense into a number somebody acts on.
    if (value !== 1 && value !== 2 && value !== 3 && value !== 4) continue;
    scores.push({ id, score: value });
  }
  return scores;
}

/**
 * Score it. Returns an empty list when the model could not be asked — the
 * web side treats that as "nothing to ask for" and lets the person through,
 * because a quality assistant that blocks is a gate.
 */
export async function scoreIntake(task: ScoreTask): Promise<DimensionScore[]> {
  return tracer.startActiveSpan("score-intake", async (span) => {
    span.setAttribute("prompt.version", promptVersion());
    span.setAttribute("model.id", modelId());
    try {
      const client = modelClient();
      const message = await client.messages.create({
        model: modelId(),
        // Generous: this reads a whole intake, and a reasoning model spends
        // most of its budget thinking before it writes anything. At 1200 it
        // returned no text at all — the same trap the drafting pass hit.
        max_tokens: 3000,
        messages: [{ role: "user", content: composeScorePrompt(task) }],
      });
      const text = textOf(
        message as unknown as {
          content: Array<{ type: string; text?: string }>;
        },
      );
      const scores = scoreGate(JSON.parse(extractJson(text)), task);
      span.setAttribute("scored", scores.length);
      return scores;
    } catch (cause) {
      span.setAttribute("gate.result", "threw");
      console.error("[score-intake]", cause);
      return [];
    } finally {
      span.end();
    }
  });
}
