/**
 * The intake quality rubric (SPEC §22.1, intake quality assistant).
 *
 * The first screen a requester sees is where friction is cheapest to
 * remove and most expensive to leave: a thin description means every
 * downstream question is asked cold, and somebody spends an hour answering
 * things their own first paragraph could have settled.
 *
 * Three layers, and only one of them is a model.
 *
 * 1. **The floor** — heuristic, here, no model. Catches a name, a fragment,
 *    keyboard noise. Costs nothing and is never wrong in an interesting way.
 * 2. **Scoring** — a model assigns 0, 1 or 2 per dimension against the
 *    published anchors. That is the whole of its job.
 * 3. **Everything after** — the pass rule and the exact feedback sentence
 *    for that dimension at that score — is deterministic and lives here.
 *
 * **It fails open.** If the model is unavailable, slow or wrong, intake
 * proceeds. A quality assistant that blocks submission has become a gate,
 * and the mission is reducing friction, not adding a checkpoint.
 *
 * **The rubric is data and it is visible to the requester.** No black-box
 * grade: they can read the anchor they were scored against.
 */
import doc from "@/data/reference/intake-rubric.json";

export type RubricDimension = {
  id: string;
  label: string;
  anchors: Record<"0" | "1" | "2", string>;
  feedback: Record<"0" | "1", string>;
  starters: Array<{ label: string; insert: string; complete: boolean }>;
};

type RubricDoc = {
  version: string;
  floor: {
    minWords: number;
    minDistinctRatio: number;
    minAverageWordLength: number;
  };
  engine: { passScore: number; failOpenOnAgentError: boolean; opening: string };
  messages: { tooShort: string; notProse: string };
  dimensions: RubricDimension[];
};

const RUBRIC = doc as RubricDoc;

export const RUBRIC_VERSION = RUBRIC.version;
export const DIMENSIONS = RUBRIC.dimensions;

/**
 * The floor: is this prose about an activity at all?
 *
 * Returns the sentence to show, or null if it clears. Deliberately crude —
 * it exists to stop a model being asked to score the word "Salesforce".
 */
export function belowFloor(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return RUBRIC.messages.tooShort;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < RUBRIC.floor.minWords) return RUBRIC.messages.tooShort;

  const distinct =
    new Set(words.map((w) => w.toLowerCase())).size / words.length;
  if (distinct < RUBRIC.floor.minDistinctRatio) return RUBRIC.messages.notProse;

  const averageLength =
    words.reduce((total, w) => total + w.length, 0) / words.length;
  if (averageLength < RUBRIC.floor.minAverageWordLength)
    return RUBRIC.messages.notProse;

  return null;
}

export type DimensionScore = { id: string; score: 0 | 1 | 2 };

export type RubricVerdict = {
  passes: boolean;
  /** The opening line, present only when there is something to ask for. */
  opening: string | null;
  /** One sentence per dimension that fell short, verbatim from the data. */
  asks: Array<{ id: string; label: string; sentence: string; anchor: string }>;
};

/**
 * Turn scores into what a person reads. Deterministic: the same scores
 * always produce the same words, and those words live in the rubric file
 * rather than in this function.
 */
export function verdictFrom(scores: DimensionScore[]): RubricVerdict {
  const asks: RubricVerdict["asks"] = [];
  for (const dimension of RUBRIC.dimensions) {
    const scored = scores.find((s) => s.id === dimension.id);
    if (!scored || scored.score >= RUBRIC.engine.passScore) continue;
    const band = String(scored.score) as "0" | "1";
    asks.push({
      id: dimension.id,
      label: dimension.label,
      sentence: dimension.feedback[band],
      // Shown alongside, so the grade is never a black box: this is what
      // "good enough" means for this dimension, in the rubric's own words.
      anchor: dimension.anchors["2"],
    });
  }
  return {
    passes: asks.length === 0,
    opening: asks.length === 0 ? null : RUBRIC.engine.opening,
    asks,
  };
}

/**
 * What to do when the model could not be asked.
 *
 * It passes. Said explicitly rather than left to a default, because the
 * alternative — a quality gate that blocks whenever a model is down — is
 * the exact failure this rubric exists to avoid.
 */
export function verdictWhenAgentUnavailable(): RubricVerdict {
  return { passes: true, opening: null, asks: [] };
}

/** Every scorable dimension, as the model is asked to score them. */
export function scoringBrief(): Array<{
  id: string;
  label: string;
  anchors: RubricDimension["anchors"];
}> {
  return RUBRIC.dimensions.map((d) => ({
    id: d.id,
    label: d.label,
    anchors: d.anchors,
  }));
}
