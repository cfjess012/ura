/**
 * The intake coherence check (FR-43, §22.1).
 *
 * The whole intake is read as one document, because **coherence is a
 * property of the set**: a description saying "internal tool" and a data
 * section listing external recipients is only incoherent when you read
 * both. That is also the one thing a person cannot check for themselves,
 * because they know what they meant.
 *
 * Three layers, and only one is a model.
 *
 * 1. **The floor** — heuristic, here, no model. Catches a product name or
 *    keyboard noise. Costs nothing and is never wrong interestingly.
 * 2. **Scoring** — a model assigns 1–4 per criterion against published
 *    anchors. That is the whole of its job.
 * 3. **Everything after** — the band, the ordering, and the exact sentence
 *    a person reads — is deterministic and lives in the rubric file.
 *
 * **It never blocks.** No agent, a slow one, a wrong one, a partial answer:
 * all pass. A quality assistant that blocks submission has become a gate,
 * and the mission is reducing friction (G-69).
 *
 * The rubric is data and visible: every ask carries the anchor it was
 * scored against, so a grade is readable rather than authoritative.
 */
import doc from "@/data/reference/intake-rubric.json";

export type Level = 1 | 2 | 3 | 4;

export type Criterion = {
  id: string;
  label: string;
  why: string;
  anchors: Record<"1" | "2" | "3" | "4", string>;
  ask: Record<"1" | "2" | "3", string>;
};

type RubricDoc = {
  version: string;
  floor: {
    minWords: number;
    minDistinctRatio: number;
    minAverageWordLength: number;
  };
  engine: { failOpenOnAgentError: boolean; opening: string };
  messages: { tooShort: string; notProse: string };
  bands: Array<{ from: number; label: string; meaning: string }>;
  criteria: Criterion[];
};

const RUBRIC = doc as RubricDoc;

export const RUBRIC_VERSION = RUBRIC.version;
export const CRITERIA = RUBRIC.criteria;

/**
 * The two that decide routing rather than merely describing it. Called out
 * first when thin: a thin answer here is a wrong routing, not a vague one.
 */
const ROUTING_CRITICAL = new Set(["dataAccess", "sensitivity"]);

/** Is this prose about an activity at all? No model needed. */
export function belowFloor(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return RUBRIC.messages.tooShort;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < RUBRIC.floor.minWords) return RUBRIC.messages.tooShort;
  const distinct =
    new Set(words.map((w) => w.toLowerCase())).size / words.length;
  if (distinct < RUBRIC.floor.minDistinctRatio) return RUBRIC.messages.notProse;
  const average =
    words.reduce((total, w) => total + w.length, 0) / words.length;
  if (average < RUBRIC.floor.minAverageWordLength)
    return RUBRIC.messages.notProse;
  return null;
}

export type Scored = { id: string; level: Level; because?: string };

export type Ask = {
  id: string;
  label: string;
  level: Level;
  /** What to do about it, verbatim from the rubric. */
  sentence: string;
  /** What full marks would look like here — the grade, made readable. */
  anchor: string;
  /** Why this criterion exists at all. */
  why: string;
  /** True for the two that decide routing. */
  routing: boolean;
};

export type Coherence = {
  /** 5–20, or null when nothing could be scored. */
  score: number | null;
  outOf: number;
  band: string | null;
  meaning: string | null;
  opening: string | null;
  asks: Ask[];
  /** Whether a model actually read it, as opposed to failing open. */
  checkedByModel: boolean;
};

/** The band a total falls in. Bands are data; this only looks it up. */
export function bandFor(score: number): { label: string; meaning: string } {
  const band =
    RUBRIC.bands.find((b) => score >= b.from) ??
    RUBRIC.bands[RUBRIC.bands.length - 1]!;
  return { label: band.label, meaning: band.meaning };
}

/**
 * Turn levels into what a person reads. Deterministic: the same levels
 * always produce the same words, and those words live in the rubric file.
 */
export function coherenceFrom(scored: Scored[]): Coherence {
  const outOf = CRITERIA.length * 4;
  if (scored.length === 0) {
    return {
      score: null,
      outOf,
      band: null,
      meaning: null,
      opening: null,
      asks: [],
      checkedByModel: false,
    };
  }

  let total = 0;
  const asks: Ask[] = [];
  for (const criterion of CRITERIA) {
    const found = scored.find((s) => s.id === criterion.id);
    // A criterion nobody scored counts as met rather than as a demand: the
    // fail-open direction, applied one criterion at a time.
    const level = found?.level ?? 4;
    total += level;
    if (level >= 4) continue;
    asks.push({
      id: criterion.id,
      label: criterion.label,
      level,
      sentence: criterion.ask[String(level) as "1" | "2" | "3"],
      anchor: criterion.anchors["4"],
      why: criterion.why,
      routing: ROUTING_CRITICAL.has(criterion.id),
    });
  }

  // Routing-critical shortfalls first, then by how thin. What decides where
  // an assessment goes is worth more of somebody's attention than what
  // merely describes it.
  asks.sort((a, b) => {
    if (a.routing !== b.routing) return a.routing ? -1 : 1;
    return a.level - b.level;
  });

  const band = bandFor(total);
  return {
    score: total,
    outOf,
    band: band.label,
    meaning: band.meaning,
    opening: asks.length === 0 ? null : RUBRIC.engine.opening,
    asks,
    checkedByModel: true,
  };
}

/** What to say when the model could not be asked. It passes, explicitly. */
export function coherenceWhenUnavailable(): Coherence {
  return {
    score: null,
    outOf: CRITERIA.length * 4,
    band: null,
    meaning: null,
    opening: null,
    asks: [],
    checkedByModel: false,
  };
}

/** Every criterion, as the model is asked to score them. */
export function scoringBrief(): Array<{
  id: string;
  label: string;
  anchors: Criterion["anchors"];
}> {
  return CRITERIA.map((c) => ({
    id: c.id,
    label: c.label,
    anchors: c.anchors,
  }));
}
