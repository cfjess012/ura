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
  /**
   * The pickable fields and what each will accept, so a proposed correction
   * can be checked against the real instrument rather than trusted. Without
   * this a fix is a model's opinion about a form it has never seen.
   */
  fields?: Array<{ id: string; label: string; options: string[] }>;
  dimensions: Array<{
    id: string;
    label: string;
    anchors: Record<string, string>;
  }>;
};

export type DimensionScore = {
  id: string;
  score: 1 | 2 | 3 | 4;
  /**
   * Why this one scored where it did, about **their** submission. The
   * rubric's own sentence is general by construction — it has to fit every
   * intake — so it can only ever say "worth naming the downstream systems".
   * This says which downstream system they left out.
   */
  note?: string;
};

/**
 * Two things in the intake that cannot both be true, each quoted from it.
 *
 * Both halves are verbatim so the person can be shown their own words
 * rather than a characterisation of them — the same rule the drafting gate
 * applies, for the same reason: a quote can be checked and a paraphrase
 * cannot.
 */
export type Conflict = {
  one: string;
  two: string;
  why: string;
  /**
   * The correction to offer, when one half is a picked answer with a
   * clearly right alternative. Checked against the instrument's own options
   * before it survives — a fix naming a field or a value that does not
   * exist is dropped, never coerced.
   */
  fix: { field: string; label: string; value: string } | null;
};

/**
 * The model's read of the activity — what it is, and what a reviewer
 * notices. Unlike the levels this is prose, so it cannot be checked the way
 * a quote can; it is shown as a reading rather than as fact, and the prompt
 * forbids inferring anything the person did not write.
 */
export type Summary = { narrative: string[] };

export type Scoring = {
  scores: DimensionScore[];
  conflicts: Conflict[];
  summary: Summary | null;
};

/** Bounds on a narrative, past which it has stopped being one. */
const PARAGRAPH_CEILING = 900;
const PARAGRAPHS_MAX = 5;
/** A note is one sentence about their text, not a second rubric. */
const NOTE_CEILING = 300;

/** Keep a read only if there is one. Empty prose is worse than none. */
export function summaryGate(parsed: unknown): Summary | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const raw = (parsed as Record<string, unknown>).narrative;
  const paragraphs = (
    Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : []
  )
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim().slice(0, PARAGRAPH_CEILING))
    .filter((p) => p !== "")
    .slice(0, PARAGRAPHS_MAX);
  if (paragraphs.length === 0) return null;
  return { narrative: paragraphs };
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
  const fields = new Map((task.fields ?? []).map((f) => [f.id, f] as const));
  const kept: Conflict[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { one, two, why, fix } = entry as Record<string, unknown>;
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
      fix: fixGate(fix, fields),
    });
  }
  return kept;
}

/**
 * A correction survives only if the instrument really has that field and
 * really offers that value.
 *
 * This is the whole safety of writing on somebody's behalf: the model may
 * choose among answers the form already allows, and may not invent one. A
 * near-miss is dropped rather than matched loosely — silently turning
 * "yes" into some other option is how a person ends up attesting to a
 * sentence nobody wrote.
 */
export function fixGate(
  raw: unknown,
  fields: Map<string, { id: string; label: string; options: string[] }>,
): Conflict["fix"] {
  if (typeof raw !== "object" || raw === null) return null;
  const { field, value } = raw as Record<string, unknown>;
  if (typeof field !== "string" || typeof value !== "string") return null;
  const known = fields.get(field.trim());
  if (!known) return null;
  const wanted = normalise(value);
  const option = known.options.find((o) => normalise(o) === wanted);
  if (option === undefined) return null;
  return { field: known.id, label: known.label, value: option };
}

/** Trim to a length without cutting a word in half. */
function clip(text: string, ceiling: number): string {
  if (text.length <= ceiling) return text;
  const cut = text.slice(0, ceiling);
  const lastSpace = cut.lastIndexOf(" ");
  return (
    (lastSpace > ceiling * 0.6 ? cut.slice(0, lastSpace) : cut).replace(
      /[,;:\s]+$/,
      "",
    ) + "…"
  );
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
  const notesRaw = (parsed as { notes?: unknown }).notes;
  const notes =
    typeof notesRaw === "object" && notesRaw !== null
      ? (notesRaw as Record<string, unknown>)
      : {};
  const asked = new Set(task.dimensions.map((d) => d.id));
  const scores: DimensionScore[] = [];
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!asked.has(id)) continue;
    // 1-4 against the published anchors. Anything else is dropped rather
    // than clamped — clamping turns nonsense into a number somebody acts on.
    if (value !== 1 && value !== 2 && value !== 3 && value !== 4) continue;
    const note = notes[id];
    scores.push({
      id,
      score: value,
      ...(typeof note === "string" && note.trim() !== ""
        ? { note: clip(note.trim(), NOTE_CEILING) }
        : {}),
    });
  }
  return scores;
}

/**
 * Score it. Returns an empty list when the model could not be asked — the
 * web side treats that as "nothing to ask for" and lets the person through,
 * because a quality assistant that blocks is a gate.
 */
/**
 * The ceiling funds THINKING AND OUTPUT, not output alone (model.ts:95).
 * This reads a whole intake — every section, answered or not — and a
 * reasoning model spends most of the budget before it writes a character.
 *
 * Raised four times now: 1200, 3000, 6000, and this. The first three were
 * each diagnosed as a parsing fault, because nothing read `stop_reason` and
 * truncation surfaces from `extractJson` as "the model returned no JSON
 * object". At 6000 it was intermittent — two runs in four truncated on the
 * same intake. `usage` is recorded on the span from here, so the next
 * number is chosen from a measured distribution rather than doubled again.
 */
const MAX_TOKENS = 16000;

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
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: composeScorePrompt(task) }],
      });
      // Say WHY it produced nothing, before trying to parse it. Truncation
      // surfaces from `extractJson` as "the model returned no JSON object",
      // which is true and useless: the ceiling has been raised three times
      // here — 1200, then 3000, then 6000 — each time diagnosed as a
      // parsing problem because nothing ever read `stop_reason`. Every
      // other capability in this service checks it; this one did not.
      // Recorded on every outcome, not only failures: a ceiling chosen
      // without the distribution underneath it is a guess that looks like a
      // decision.
      const usage = (message as unknown as {
        usage?: { input_tokens?: number; output_tokens?: number };
      }).usage;
      if (usage) {
        span.setAttribute("usage.input", usage.input_tokens ?? 0);
        span.setAttribute("usage.output", usage.output_tokens ?? 0);
      }
      if ((message as { stop_reason?: string }).stop_reason === "max_tokens") {
        span.setAttribute("gate.result", "truncated");
        console.error(
          `[score-intake] truncated at max_tokens (${MAX_TOKENS}) — the whole intake plus its unanswered questions did not fit`,
        );
        return { scores: [], conflicts: [], summary: null };
      }
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
