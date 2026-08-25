/**
 * Scoring an intake description against the rubric (SPEC §22.1).
 *
 * The model assigns 0/1/2 per dimension and nothing else. The pass rule and
 * every word a person reads are deterministic and live on the web side —
 * which is what makes this the smallest possible job to hand a model, and
 * the easiest to be wrong about safely.
 */
import { trace } from "@opentelemetry/api";
import { quoteAppearsVerbatim } from "../../src/lib/agent-contract.ts";
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
 * Two things in the intake that cannot both be true, each quoted from it.
 *
 * Both halves are verbatim so the person can be shown their own words
 * rather than a characterisation of them — the same rule the drafting gate
 * applies, for the same reason: a quote can be checked and a paraphrase
 * cannot.
 */
export type Conflict = { one: string; two: string; why: string };

/**
 * The model's read of the activity — what it is, and what a reviewer
 * notices. Unlike the levels this is prose, so it cannot be checked the way
 * a quote can; it is shown as a reading rather than as fact, and the prompt
 * forbids inferring anything the person did not write.
 */
export type Summary = { readsAs: string; standsOut: string[] };

export type Scoring = {
  scores: DimensionScore[];
  conflicts: Conflict[];
  summary: Summary | null;
};

/** How long a read may run before it has stopped being a summary. */
const READ_CEILING = 700;
const OBSERVATION_CEILING = 240;

/** Keep a read only if there is one. Empty prose is worse than none. */
export function summaryGate(parsed: unknown): Summary | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const raw = parsed as Record<string, unknown>;
  const readsAs =
    typeof raw.readsAs === "string"
      ? raw.readsAs.trim().slice(0, READ_CEILING)
      : "";
  const standsOut = Array.isArray(raw.standsOut)
    ? raw.standsOut
        .filter((o): o is string => typeof o === "string")
        .map((o) => o.trim().slice(0, OBSERVATION_CEILING))
        .filter((o) => o !== "")
        .slice(0, 4)
    : [];
  if (readsAs === "" && standsOut.length === 0) return null;
  return { readsAs, standsOut };
}

/**
 * Keep only conflicts whose **both** halves appear verbatim in the intake.
 *
 * A conflict is an accusation that somebody contradicted themselves. If it
 * cannot be shown in their own words it does not get made, because the cost
 * of a wrong one is a person hunting for a disagreement that is not there.
 */
export function conflictGate(parsed: unknown, task: ScoreTask): Conflict[] {
  const raw = (parsed as { conflicts?: unknown } | null)?.conflicts;
  if (!Array.isArray(raw)) return [];
  const kept: Conflict[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { one, two, why } = entry as Record<string, unknown>;
    if (typeof one !== "string" || typeof two !== "string") continue;
    if (one.trim() === "" || two.trim() === "") continue;
    // Both halves, or neither. Half a contradiction is not a smaller
    // contradiction — it is an unsupported claim about somebody's answers.
    if (!quoteAppearsVerbatim(one, task.description)) continue;
    if (!quoteAppearsVerbatim(two, task.description)) continue;
    if (normalise(one) === normalise(two)) continue;
    kept.push({
      one: one.trim(),
      two: two.trim(),
      why: typeof why === "string" ? why.trim() : "",
    });
  }
  return kept;
}

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

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
export async function scoreIntake(task: ScoreTask): Promise<Scoring> {
  return tracer.startActiveSpan("score-intake", async (span) => {
    span.setAttribute("prompt.version", promptVersion());
    span.setAttribute("model.id", modelId());
    try {
      const client = modelClient();
      const message = await client.messages.create({
        model: modelId(),
        // Generous, twice over. This reads a whole intake — every section,
        // answered or not — and a reasoning model spends most of its budget
        // thinking before it writes. It returned no text at all at 1200,
        // then again at 3000 once the unanswered questions were included.
        max_tokens: 6000,
        messages: [{ role: "user", content: composeScorePrompt(task) }],
      });
      const text = textOf(
        message as unknown as {
          content: Array<{ type: string; text?: string }>;
        },
      );
      const parsed = JSON.parse(extractJson(text));
      const scores = scoreGate(parsed, task);
      const conflicts = conflictGate(parsed, task);
      const summary = summaryGate(parsed);
      span.setAttribute("scored", scores.length);
      span.setAttribute("conflicts", conflicts.length);
      span.setAttribute("summarised", summary !== null);
      return { scores, conflicts, summary };
    } catch (cause) {
      span.setAttribute("gate.result", "threw");
      console.error("[score-intake]", cause);
      return { scores: [], conflicts: [], summary: null };
    } finally {
      span.end();
    }
  });
}
